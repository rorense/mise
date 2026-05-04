import { formatTimerRemaining } from '@/lib/stepTimers';
import Constants from 'expo-constants';

export type ActiveStepTimer = {
  stepId: string;
  label: string;
  remainingSeconds: number;
  isPaused: boolean;
};

export type TimerNotificationAction = 'pause' | 'resume' | 'stop' | null;

const TIMER_CHANNEL_ID = 'step-timers';
const TIMER_KIND = 'step-timer';
const TIMER_RUNNING_CATEGORY_ID = 'step-timer-running';
const TIMER_PAUSED_CATEGORY_ID = 'step-timer-paused';
const TIMER_ACTION_PAUSE = 'timer-pause';
const TIMER_ACTION_RESUME = 'timer-resume';
const TIMER_ACTION_STOP = 'timer-stop';
const NOTIFICATION_DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

let didConfigureNotifications = false;
let activeTimerNotificationId: string | null = null;
let didConfigureGlobalHandler = false;
let NotificationsModulePromise: Promise<typeof import('expo-notifications') | null> | null = null;

type NotificationResponseLike = {
  actionIdentifier?: string;
  notification?: {
    request?: {
      content?: {
        data?: Record<string, unknown>;
      };
    };
  };
};

function supportsNotificationModule() {
  return Constants.executionEnvironment !== 'storeClient';
}

async function getNotificationsModule() {
  if (!supportsNotificationModule()) return null;
  if (!NotificationsModulePromise) {
    NotificationsModulePromise = import('expo-notifications')
      .then((module) => module)
      .catch(() => null);
  }
  return NotificationsModulePromise;
}

export async function configureGlobalNotificationHandler() {
  if (didConfigureGlobalHandler) return;
  didConfigureGlobalHandler = true;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function configureTimerNotifications() {
  if (didConfigureNotifications) return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  didConfigureNotifications = true;

  await Notifications.setNotificationChannelAsync(TIMER_CHANNEL_ID, {
    name: 'Step timers',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0],
    sound: null,
  });

  await Notifications.setNotificationCategoryAsync(TIMER_RUNNING_CATEGORY_ID, [
    {
      identifier: TIMER_ACTION_PAUSE,
      buttonTitle: 'Pause',
    },
    {
      identifier: TIMER_ACTION_STOP,
      buttonTitle: 'Stop',
      options: {
        isDestructive: true,
      },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(TIMER_PAUSED_CATEGORY_ID, [
    {
      identifier: TIMER_ACTION_RESUME,
      buttonTitle: 'Resume',
    },
    {
      identifier: TIMER_ACTION_STOP,
      buttonTitle: 'Stop',
      options: {
        isDestructive: true,
      },
    },
  ]);
}

export async function ensureTimerNotificationPermission() {
  await configureTimerNotifications();
  const Notifications = await getNotificationsModule();
  if (!Notifications) return false;
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) return true;
  const requestResult = await Notifications.requestPermissionsAsync();
  return requestResult.granted;
}

export async function syncActiveTimerNotification(timer: ActiveStepTimer | null) {
  await configureTimerNotifications();
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  if (!timer) {
    if (activeTimerNotificationId) {
      await Notifications.dismissNotificationAsync(activeTimerNotificationId);
      activeTimerNotificationId = null;
    }
    return;
  }

  if (activeTimerNotificationId) {
    await Notifications.dismissNotificationAsync(activeTimerNotificationId);
    activeTimerNotificationId = null;
  }

  const statusLabel = timer.isPaused ? 'Paused at' : 'Time left';
  activeTimerNotificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: timer.label,
      body: `${statusLabel}: ${formatTimerRemaining(timer.remainingSeconds)}`,
      data: { kind: TIMER_KIND },
      sound: false,
      categoryIdentifier: timer.isPaused
        ? TIMER_PAUSED_CATEGORY_ID
        : TIMER_RUNNING_CATEGORY_ID,
      sticky: !timer.isPaused,
    },
    trigger: null,
  });
}

export async function presentTimerDoneNotification(label: string) {
  await configureTimerNotifications();
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Timer done',
      body: `${label} finished.`,
      data: { kind: TIMER_KIND },
    },
    trigger: null,
  });
}

export function extractTimerNotificationAction(
  response: NotificationResponseLike
): TimerNotificationAction {
  const kind = response.notification?.request?.content?.data?.kind;
  if (kind !== TIMER_KIND) return null;
  switch (response.actionIdentifier) {
    case TIMER_ACTION_PAUSE:
      return 'pause';
    case TIMER_ACTION_RESUME:
      return 'resume';
    case TIMER_ACTION_STOP:
      return 'stop';
    default:
      return null;
  }
}

export function registerTimerNotificationActionListener(
  onAction: (action: TimerNotificationAction) => void
) {
  let cleanup = () => {};
  let isActive = true;

  void (async () => {
    const Notifications = await getNotificationsModule();
    if (!Notifications || !isActive) return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === NOTIFICATION_DEFAULT_ACTION) return;
      const action = extractTimerNotificationAction(response);
      if (action) {
        onAction(action);
      }
    });
    cleanup = () => subscription.remove();
  })();

  return () => {
    isActive = false;
    cleanup();
  };
}
