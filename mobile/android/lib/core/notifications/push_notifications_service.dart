import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../features/notifications/data/notifications_repository.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Ignore: foreground service already handles missing Firebase configuration gracefully.
  }
}

class PushNotificationsService {
  PushNotificationsService({required NotificationsRepository repository})
      : _repository = repository;

  final NotificationsRepository _repository;
  FirebaseMessaging? _messaging;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  StreamSubscription<String>? _tokenRefreshSubscription;
  StreamSubscription<RemoteMessage>? _foregroundMessageSubscription;

  bool _initialized = false;
  bool _pushEnabled = false;
  bool _isAuthenticated = false;
  String? _activeToken;
  final Completer<void> _readyCompleter = Completer<void>();

  Future<void> initialize() async {
    if (_initialized) {
      await _readyCompleter.future;
      return;
    }
    _initialized = true;

    try {
      await _configureLocalNotifications();
    } catch (error) {
      debugPrint('Local notification setup failed: $error');
    }

    try {
      await Firebase.initializeApp();
      _messaging = FirebaseMessaging.instance;
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      _foregroundMessageSubscription = FirebaseMessaging.onMessage.listen(
        _onForegroundMessage,
      );
      _tokenRefreshSubscription = _messaging!.onTokenRefresh.listen((token) {
        _activeToken = token;
        if (_isAuthenticated) {
          unawaited(_safeRegisterToken(token));
        }
      });
      _pushEnabled = true;
    } catch (error) {
      debugPrint('Push disabled: setup failed. $error');
      _pushEnabled = false;
    } finally {
      if (!_readyCompleter.isCompleted) {
        _readyCompleter.complete();
      }
    }
  }

  Future<void> syncAuthState(bool isAuthenticated) async {
    _isAuthenticated = isAuthenticated;
    await _readyCompleter.future;

    if (isAuthenticated) {
      await _requestSystemNotificationPermission();
    }

    final messaging = _messaging;
    if (!_pushEnabled || messaging == null) return;

    if (isAuthenticated) {
      await _requestPermission(messaging);
      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) {
        _activeToken = token;
        await _safeRegisterToken(token);
      }
      return;
    }

    final token = _activeToken ?? await messaging.getToken();
    if (token != null && token.isNotEmpty) {
      await _safeUnregisterToken(token);
    }
  }

  Future<void> dispose() async {
    await _tokenRefreshSubscription?.cancel();
    await _foregroundMessageSubscription?.cancel();
  }

  Future<void> _requestPermission(FirebaseMessaging messaging) async {
    try {
      await messaging.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );
    } catch (error) {
      debugPrint('Push permission request failed: $error');
    }
  }

  Future<void> _requestSystemNotificationPermission() async {
    try {
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
    } catch (error) {
      debugPrint('Android notification permission request failed: $error');
    }
  }

  Future<void> _configureLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);
    await _localNotifications.initialize(initSettings);

    const channel = AndroidNotificationChannel(
      'mybuddy_default',
      'MyBuddy Notifications',
      description: 'Chat and activity notifications',
      importance: Importance.high,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
  }

  Future<void> _onForegroundMessage(RemoteMessage message) async {
    final title = message.notification?.title?.trim();
    final body = message.notification?.body?.trim();
    if ((title ?? '').isEmpty && (body ?? '').isEmpty) {
      return;
    }

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'mybuddy_default',
        'MyBuddy Notifications',
        channelDescription: 'Chat and activity notifications',
        importance: Importance.high,
        priority: Priority.high,
      ),
    );

    await _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title ?? 'MyBuddy',
      body ?? 'You have a new update.',
      details,
    );
  }

  Future<void> _safeRegisterToken(String token) async {
    try {
      await _repository.registerPushToken(
        token: token,
        platform: defaultTargetPlatform == TargetPlatform.iOS
            ? 'ios'
            : 'android',
      );
    } catch (error) {
      debugPrint('Push token registration failed: $error');
    }
  }

  Future<void> _safeUnregisterToken(String token) async {
    try {
      await _repository.unregisterPushToken(token);
    } catch (error) {
      debugPrint('Push token removal failed: $error');
    }
  }
}
