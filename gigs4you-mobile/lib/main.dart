import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'core/api/api_client.dart';
import 'core/storage/auth_storage.dart';
import 'features/auth/auth_provider.dart';
import 'features/tasks/tasks_provider.dart';
import 'features/jobs/jobs_provider.dart';
import 'features/gps/gps_provider.dart';
import 'features/profile/profile_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/home/worker_home.dart';
import 'features/home/agent_home.dart';
import 'features/manager/manager_home.dart';
import 'shared/theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  final storage  = AuthStorage();
  final token    = await storage.getToken();
  final userData = await storage.getUser();
  final role     = userData?['role'] ?? 'worker';
  final orgId    = userData?['organisationId'];

  final sentryDsn = const String.fromEnvironment('SENTRY_DSN');

  if (sentryDsn.isNotEmpty) {
    await SentryFlutter.init(
      (options) {
        options.dsn              = sentryDsn;
        options.tracesSampleRate = 0.2;
        options.environment      = const String.fromEnvironment('ENV', defaultValue: 'development');
        options.attachScreenshot = true;
      },
      appRunner: () => runApp(
        Gigs4YouApp(isLoggedIn: token != null, initialRole: role, orgId: orgId)
      ),
    );
  } else {
    runApp(Gigs4YouApp(isLoggedIn: token != null, initialRole: role, orgId: orgId));
  }
}

class Gigs4YouApp extends StatelessWidget {
  final bool isLoggedIn;
  final String initialRole;
  final String? orgId;

  const Gigs4YouApp({
    super.key,
    required this.isLoggedIn,
    required this.initialRole,
    this.orgId,
  });

  @override
  Widget build(BuildContext context) {
    final apiClient = ApiClient();

    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: apiClient),
        ChangeNotifierProvider(create: (_) => AuthProvider(apiClient)),
        ChangeNotifierProvider(create: (_) => ProfileProvider(apiClient)),
        ChangeNotifierProvider(create: (_) => TasksProvider(apiClient)),
        ChangeNotifierProvider(create: (_) => JobsProvider(apiClient)),
        ChangeNotifierProvider(create: (_) => GpsProvider(apiClient)),
      ],
      child: MaterialApp(
        title: 'Gigs4You',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        initialRoute: _initialRoute(),
        routes: {
          '/login':    (_) => const LoginScreen(),
          '/register': (_) => const RegisterScreen(),
          '/worker':   (_) => const WorkerHome(),
          '/agent':    (_) => const AgentHome(),
          '/manager':  (_) => const ManagerHome(),
        },
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
    if (['super_admin','admin','manager','supervisor','employer'].contains(role)) {
      return '/manager';
    }
    if (role == 'agent' && orgId != null && orgId.isNotEmpty) {
      return '/agent';
    }
    // worker or agent without org
    return '/worker';
  }
}
