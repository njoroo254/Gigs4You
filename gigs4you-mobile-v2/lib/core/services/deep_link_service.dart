import 'dart:async';
import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'notification_service.dart' show navigatorKey;

/// Parsed intent from an incoming deep link.
class DeepLinkIntent {
  final DeepLinkType type;
  final String id;
  const DeepLinkIntent(this.type, this.id);
}

enum DeepLinkType { task, job, chat, payment, unknown }

/// Singleton that listens for deep links (custom scheme + App Links) and
/// routes the app to the right screen once the navigator is ready.
///
/// Supported URIs:
///   gigs4you://task/UUID         → open task detail
///   gigs4you://job/UUID          → open job detail
///   gigs4you://chat/ROOM_ID      → open chat room
///   gigs4you://payment/UUID      → open payment detail
///   https://app.gigs4you.co.ke/task/UUID  → same (App Links)
class DeepLinkService {
  DeepLinkService._();
  static final instance = DeepLinkService._();

  final _appLinks = AppLinks();
  StreamSubscription<Uri>? _sub;

  // Pending intent when link arrives before navigator is ready
  DeepLinkIntent? _pending;

  /// Call once in main() after navigator is ready.
  Future<void> init() async {
    // Handle link that launched the app from cold start
    final initial = await _appLinks.getInitialLink();
    if (initial != null) _route(initial);

    // Handle links while app is already running
    _sub = _appLinks.uriLinkStream.listen(
      _route,
      onError: (_) {/* ignore malformed links */},
    );
  }

  void dispose() => _sub?.cancel();

  /// Consume a pending intent (called by home screens on mount).
  DeepLinkIntent? consumePending() {
    final p = _pending;
    _pending = null;
    return p;
  }

  void _route(Uri uri) {
    final intent = _parse(uri);
    if (intent == null || intent.type == DeepLinkType.unknown) return;

    final nav = navigatorKey.currentState;
    if (nav == null) {
      // Navigator not ready — store for later
      _pending = intent;
      return;
    }

    _navigate(nav, intent);
  }

  void _navigate(NavigatorState nav, DeepLinkIntent intent) {
    switch (intent.type) {
      case DeepLinkType.task:
        nav.pushNamed('/deep/task', arguments: intent.id);
        break;
      case DeepLinkType.job:
        nav.pushNamed('/deep/job', arguments: intent.id);
        break;
      case DeepLinkType.chat:
        nav.pushNamed('/deep/chat', arguments: intent.id);
        break;
      case DeepLinkType.payment:
        nav.pushNamed('/deep/payment', arguments: intent.id);
        break;
      case DeepLinkType.unknown:
        break;
    }
  }

  static DeepLinkIntent? _parse(Uri uri) {
    // Both schemes map to the same path structure:
    //   gigs4you://task/UUID
    //   https://app.gigs4you.co.ke/task/UUID
    final segments = uri.pathSegments;
    if (segments.length < 2) return null;

    final type = switch (segments[0]) {
      'task'    => DeepLinkType.task,
      'job'     => DeepLinkType.job,
      'chat'    => DeepLinkType.chat,
      'payment' => DeepLinkType.payment,
      _         => DeepLinkType.unknown,
    };

    return DeepLinkIntent(type, segments[1]);
  }
}
