import NetInfo from '@react-native-community/netinfo';
import {
  createRecipeAdjustment,
  deleteQueuedAiAction,
  getRecipeById,
  listQueuedAiActions,
  markQueuedAiActionAttempt,
} from '@/data/recipes';
import { getAiCredentials } from '@/lib/aiConfig';
import { suggestRecipeAdjustmentsFromCookNote } from '@/lib/ai/cookLogAdjustments';

/**
 * Guards against overlapping drains. Without this, two callers (e.g. a screen
 * focus and an app foreground landing together) both read the same queue rows
 * and send the same request twice.
 */
let isDraining = false;

export async function drainOfflineAiQueue(): Promise<void> {
  if (isDraining) return;
  const network = await NetInfo.fetch();
  if (!network.isConnected) return;

  isDraining = true;
  try {
    await processQueuedActions();
  } finally {
    isDraining = false;
  }
}

/** Give up on an action after this many failures rather than retrying forever. */
const MAX_QUEUE_ATTEMPTS = 5;

async function processQueuedActions(): Promise<void> {
  const actions = await listQueuedAiActions();
  for (const action of actions) {
    if (action.action_type !== 'cook_log_adjustment') {
      await deleteQueuedAiAction(action.id);
      continue;
    }
    if (action.attempts >= MAX_QUEUE_ATTEMPTS) {
      // Permanently failing work (bad payload, revoked key) would otherwise be
      // retried on every drain for the life of the install.
      await deleteQueuedAiAction(action.id);
      continue;
    }
    try {
      const payload = JSON.parse(action.payload_json) as {
        recipeId: string;
        cookLogId: string;
        note: string;
      };
      const recipe = await getRecipeById(payload.recipeId);
      if (!recipe) {
        await deleteQueuedAiAction(action.id);
        continue;
      }
      const credentials = await getAiCredentials();
      if (!credentials.ok) {
        await markQueuedAiActionAttempt(
          action.id,
          credentials.reason === 'disabled' ? 'AI is off' : 'Missing API key'
        );
        continue;
      }
      const suggestions = await suggestRecipeAdjustmentsFromCookNote({
        recipe,
        note: payload.note,
        provider: credentials.provider,
        apiKey: credentials.apiKey,
      });
      await createRecipeAdjustment({
        recipeId: payload.recipeId,
        cookLogId: payload.cookLogId,
        suggestions,
      });
      await deleteQueuedAiAction(action.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await markQueuedAiActionAttempt(action.id, message);
    }
  }
}
