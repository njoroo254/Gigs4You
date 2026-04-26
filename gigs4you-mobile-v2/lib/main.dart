import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'core/services/notification_service.dart';
export 'core/services/notification_service.dart' show navigatorKey;
import 'core/api/api_client.dart';
import 'core/storage/auth_storage.dart';
import 'core/services/deep_link_service.dart';
import 'features/auth/auth_provider.dart';
import 'features/tasks/tasks_provider.dart';
import 'features/jobs/jobs_provider.dart';
import 'features/gps/gps_provider.dart';
import 'features/profile/profile_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/auth/forgot_password_screen.dart';
import 'features/home/worker_home.dart';
import 'features/home/agent_home.dart';
import 'features/manager/manager_home.dart';
import 'shared/theme/app_theme.dart';
import 'shared/theme/theme_provider.dart';
import 'shared/screens/deep_link_screen.dart';

/// Must be a top-level function for FCM background processing
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Background messages are shown automatically by the system
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  // Initialize Firebase (required before any firebase_* package calls)
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);
    await NotificationService.instance.init();
  } catch (e, st) {
    Sentry.captureException(e, stackTrace: st);
    // App can still run in offline/local mode; Firebase push/unregister features will be disabled.
  }

  // Deep link listener — must start before runApp so cold-start links are captured
  await DeepLinkService.instance.init();

  final storage = AuthStorage();
  final token = await storage.getToken();
  final userData = await storage.getUser();
  final role   = userData?['role'] ?? 'worker';
  final orgId  = userData?['organisationId'];
  final userId = userData?['id'] as String?;

  // Load this user's saved theme before the first frame
  final themeProvider = ThemeProvider();
  await themeProvider.loadForUser(userId);

  final sentryDsn = const String.fromEnvironment('SENTRY_DSN');

  if (sentryDsn.isNotEmpty) {
    await SentryFlutter.init(
      (options) {
        options.dsn = sentryDsn;
        options.tracesSampleRate = 0.2;
        options.environment =
            const String.fromEnvironment('ENV', defaultValue: 'development');
        options.attachScreenshot = true;
      },
      appRunner: () => runApp(Gigs4YouApp(
          isLoggedIn: token != null, initialRole: role, orgId: orgId,
          themeProvider: themeProvider)),
    );
  } else {
    runApp(Gigs4YouApp(
        isLoggedIn: token != null, initialRole: role, orgId: orgId,
        themeProvider: themeProvider));
  }
}

class Gigs4YouApp extends StatelessWidget {
  final bool isLoggedIn;
  final String initialRole;
  final String? orgId;
  final ThemeProvider themeProvider;

  const Gigs4YouApp({
    super.key,
    required this.isLoggedIn,
    required this.initialRole,
    required this.themeProvider,
    this.orgId,
  });

  @override
  Widget build(BuildContext context) {
    final apiClient = ApiClient();

    return MultiProvider(
      providers: [
        ChangeNotifierProvider<ThemeProvider>.value(value: themeProvider),
        Provider<ApiClient>.value(value: apiClient),
        ChangeNotifierProvider(create: (_) => AuthProvider(apiClient)),
        ChangeNotifierProvider(create: (_) => ProfileProvider(apiClient)),
        ChangeNotifierProvider(create: (_) => TasksProvider(apiClient)),
        ChangeNotifierProvider(create: (_) => JobsProvider(apiClient)),
        ChangeNotifierProvider(create: (_) => GpsProvider(apiClient)),
      ],
      child: Consumer<ThemeProvider>(
        builder: (_, theme, __) => MaterialApp(
          title: 'Gigs4You',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          themeMode: theme.mode,
          navigatorKey: navigatorKey,
          initialRoute: _initialRoute(),
          routes: {
            '/login':           (_) => const LoginScreen(),
            '/register':        (_) => const RegisterScreen(),
            '/forgot-password': (_) => const ForgotPasswordScreen(),
            '/worker':          (_) => const WorkerHome(),
            '/agent':           (_) => const AgentHome(),
            '/manager':         (_) => const ManagerHome(),
            // Deep-link destinations
            '/deep/task': (ctx) => DeepLinkTaskScreen(
                taskId: ModalRoute.of(ctx)!.settings.arguments as String),
            '/deep/job':  (ctx) => DeepLinkJobScreen(
                jobId: ModalRoute.of(ctx)!.settings.arguments as String),
          },
        ),
      ),
    );
  }

  String _initialRoute() {
    if (!isLoggedIn) return '/login';
    return _routeForRole(initialRole, orgId);
  }

  static String routeForRole(String role, String? orgId) =>
      _routeForRole(role, orgId);

  static String _routeForRole(String role, String? orgId) {
    if (['super_admin', 'admin', 'manager', 'supervisor', 'employer']
        .contains(role)) {
      return '/manager';
    }
    if (role == 'agent' && orgId != null && orgId.isNotEmpty) {
      return '/agent';
    }
    // worker or agent without org
    return '/worker';
  }
}
