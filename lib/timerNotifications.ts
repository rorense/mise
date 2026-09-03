import Constants from 'expo-constants';

const TIMER_CHANNEL_ID = 'step-timers';
const TIMER_KIND = 'step-timer';

let didConfigureNotifications = false;
let didConfigureGlobalHandler = false;
let NotificationsModulePromise: Promise<typeof import('expo-notifications') | null> | null = null;

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

async function configureTimerNotifications() {
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
