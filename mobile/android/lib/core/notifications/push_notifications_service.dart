import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../features/personal/data/personal_models.dart';
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

  static const String _defaultChannelId = 'mybuddy_default';
  static const String _defaultChannelName = 'MyBuddy Notifications';
  static const String _defaultChannelDescription =
      'Chat and activity notifications';
  static const String _taskChannelId = 'mybuddy_task_due';
  static const String _taskChannelName = 'MyBuddy Task Reminders';
  static const String _taskChannelDescription = 'Task due date reminders';
  static const String _taskPayloadPrefix = 'task_due:';

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

  Future<void> syncTaskDueReminders(List<PersonalTask> tasks) async {
    await _readyCompleter.future;
    try {
      final pending = await _localNotifications.pendingNotificationRequests();
      for (final request in pending) {
        final payload = (request.payload ?? '').trim();
        if (payload.startsWith(_taskPayloadPrefix)) {
          await _localNotifications.cancel(request.id);
        }
      }

      final now = DateTime.now();
      for (final task in tasks) {
        final reminderAt = _resolveReminderTime(task);
        if (reminderAt == null || !reminderAt.isAfter(now)) {
          continue;
        }

        final dueAt = _parseDueDate(task.dueDate);
        final leadHours = _leadTimeForPriority(task.priority).inHours;
        final priorityLabel = _normalizePriority(task.priority).toUpperCase();
        final dueLabel = dueAt == null
            ? (task.dueDate ?? '').trim()
            : _formatDateTime(dueAt);

        await _localNotifications.zonedSchedule(
          _taskReminderNotificationId(task.id),
          'Task due soon',
          '$priorityLabel priority | ${task.title} | Due $dueLabel (in $leadHours h)',
          tz.TZDateTime.from(reminderAt.toUtc(), tz.UTC),
          const NotificationDetails(
            android: AndroidNotificationDetails(
              _taskChannelId,
              _taskChannelName,
              channelDescription: _taskChannelDescription,
              importance: Importance.high,
              priority: Priority.high,
            ),
          ),
          uiLocalNotificationDateInterpretation:
              UILocalNotificationDateInterpretation.absoluteTime,
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
          payload: '$_taskPayloadPrefix${task.id}',
        );
      }
    } catch (error) {
      debugPrint('Task reminder sync failed: $error');
    }
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
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);
    await _localNotifications.initialize(initSettings);

    const channel = AndroidNotificationChannel(
      _defaultChannelId,
      _defaultChannelName,
      description: _defaultChannelDescription,
      importance: Importance.high,
    );
    const taskChannel = AndroidNotificationChannel(
      _taskChannelId,
      _taskChannelName,
      description: _taskChannelDescription,
      importance: Importance.high,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(taskChannel);
  }

  Future<void> _onForegroundMessage(RemoteMessage message) async {
    final title = message.notification?.title?.trim();
    final body = message.notification?.body?.trim();
    if ((title ?? '').isEmpty && (body ?? '').isEmpty) {
      return;
    }

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        _defaultChannelId,
        _defaultChannelName,
        channelDescription: _defaultChannelDescription,
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
        platform:
            defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
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

  DateTime? _resolveReminderTime(PersonalTask task) {
    if (task.id.trim().isEmpty) return null;
    final status = task.status.trim().toLowerCase();
    if (status == 'complete') return null;

    final dueAt = _parseDueDate(task.dueDate);
    if (dueAt == null) return null;

    return dueAt.subtract(_leadTimeForPriority(task.priority));
  }

  Duration _leadTimeForPriority(String priority) {
    return switch (_normalizePriority(priority)) {
      'high' => const Duration(hours: 48),
      'urgent' => const Duration(hours: 48),
      'low' => const Duration(hours: 24),
      _ => const Duration(hours: 36),
    };
  }

  String _normalizePriority(String priority) => priority.trim().toLowerCase();

  DateTime? _parseDueDate(String? raw) {
    final input = (raw ?? '').trim();
    if (input.isEmpty) return null;

    final parsed = DateTime.tryParse(input);
    if (parsed == null) return null;

    final local = parsed.isUtc ? parsed.toLocal() : parsed;
    final looksDateOnly = RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(input);
    if (looksDateOnly) {
      return DateTime(local.year, local.month, local.day, 23, 59);
    }
    return local;
  }

  int _taskReminderNotificationId(String taskId) {
    final bytes = utf8.encode(taskId.trim());
    var hash = 0;
    for (final value in bytes) {
      hash = (hash * 31 + value) & 0x7fffffff;
    }
    return 900000000 + (hash % 50000000);
  }

  String _formatDateTime(DateTime value) {
    final local = value.toLocal();
    final year = local.year.toString().padLeft(4, '0');
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$year-$month-$day $hour:$minute';
  }
}
