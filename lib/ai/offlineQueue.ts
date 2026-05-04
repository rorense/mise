import NetInfo from '@react-native-community/netinfo';
import {
  createRecipeAdjustment,
  deleteQueuedAiAction,
  getRecipeById,
  listQueuedAiActions,
  markQueuedAiActionAttempt,
} from '@/data/recipes';
import { getBundledAiKey } from '@/lib/aiConfig';
import { suggestRecipeAdjustmentsFromCookNote } from '@/lib/ai/cookLogAdjustments';
import { getAiProvider } from '@/lib/secrets';

export async function drainOfflineAiQueue(): Promise<void> {
  const network = await NetInfo.fetch();
  if (!network.isConnected) return;

  const actions = await listQueuedAiActions();
  for (const action of actions) {
    if (action.action_type !== 'cook_log_adjustment') {
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
      const provider = await getAiProvider();
      const apiKey = getBundledAiKey(provider);
      if (!apiKey) {
        await markQueuedAiActionAttempt(action.id, 'Missing API key');
        continue;
      }
      const suggestions = await suggestRecipeAdjustmentsFromCookNote({
        recipe,
        note: payload.note,
        provider,
        apiKey,
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
