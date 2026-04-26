import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

// ── Global navigator key so we can navigate from notification taps ──────────
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

/// Handles all push notification display and routing.
///
/// Setup checklist (replace placeholders before going live):
///   1. Replace android/app/google-services.json with real Firebase project file
///   2. Set FCM_SERVICE_ACCOUNT_JSON in .env to real Firebase service account JSON
///   3. iOS: add GoogleService-Info.plist and enable Push Notifications capability
class NotificationService {
  NotificationService._();
  static final instance = NotificationService._();

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  static const _channel = AndroidNotificationChannel(
    'gigs4you_main',
    'Gigs4You Alerts',
    description: 'Task assignments, chat messages and payments',
    importance: Importance.high,
    playSound: true,
    enableVibration: true,
  );

  Future<void> init() async {
    if (_ready) return;

    // Create Android high-importance channel
    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      ),
    );
    await _plugin.initialize(
      settings: initSettings,
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    // Request permission (iOS prompt; Android 13+ OS dialog shown once)
    await FirebaseMessaging.instance.requestPermission(
      alert: true, badge: true, sound: true,
    );

    // Force-enable foreground notifications on iOS
    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
      alert: true, badge: true, sound: true,
    );

    // ── Foreground messages ────────────────────────────────────────────────
    // Both notification+data and data-only messages are handled here.
    FirebaseMessaging.onMessage.listen(_onForegroundMessage);

    // ── Background/terminated → app opened via notification tap ──────────
    FirebaseMessaging.onMessageOpenedApp.listen(_routeFromMessage);

    // ── App launched cold from a tapped notification ──────────────────────
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _routeFromMessage(initial);

    _ready = true;
  }

  // ── Foreground: show local pop-up for any incoming FCM message ───────────
  void _onForegroundMessage(RemoteMessage message) {
    // Support both notification messages and data-only messages
    final title = message.notification?.title ?? message.data['title'] ?? 'Gigs4You';
    final body  = message.notification?.body  ?? message.data['body']  ?? '';
    if (body.isEmpty) return;
    _showLocal(message.hashCode, title, body, payload: message.data['screen']);
  }

  // ── Route to screen when a notification is tapped ────────────────────────
  void _routeFromMessage(RemoteMessage message) {
    final screen = message.data['screen'] as String?;
    if (screen == null || screen.isEmpty) return;
    navigatorKey.currentState?.pushNamed(screen);
  }

  // ── Handle tap on a local notification ───────────────────────────────────
  void _onNotificationTap(NotificationResponse response) {
    final screen = response.payload;
    if (screen == null || screen.isEmpty) return;
    navigatorKey.currentState?.pushNamed(screen);
  }

  // ── Core display helper ───────────────────────────────────────────────────
  void _showLocal(int id, String title, String body, {String? payload}) {
    if (!_ready) return;
    _plugin.show(
      id: id,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id, _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          styleInformation: BigTextStyleInformation(body),
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true, presentBadge: true, presentSound: true,
        ),
      ),
      payload: payload,
    );
  }

  /// Show an in-app notification programmatically (e.g. from a WebSocket event).
  Future<void> show(String title, String body, {String? screen}) async {
    _showLocal(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      payload: screen,
    );
  }
}
