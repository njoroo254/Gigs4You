import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/storage/auth_storage.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';
import '../profile/profile_provider.dart';
import '../tasks/tasks_provider.dart';
import '../jobs/jobs_provider.dart';
import 'manager_dashboard_tab.dart';
import 'manager_agents_tab.dart';
import 'manager_tasks_tab.dart';
import 'manager_jobs_tab.dart';
import 'manager_profile_tab.dart';
import '../chat/chat_tab.dart';
import '../wallet/manager_wallet_tab.dart';

class ManagerHome extends StatefulWidget {
  const ManagerHome({super.key});
  @override State<ManagerHome> createState() => _ManagerHomeState();
}

class _ManagerHomeState extends State<ManagerHome> {
  int _tab = 0;
  String _role = 'manager';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProfileProvider>().loadProfile();
      context.read<TasksProvider>().loadTasks();
      context.read<JobsProvider>().loadJobs();
    });
    _loadRole();
  }

  Future<void> _loadRole() async {
    final userData = await AuthStorage().getUser();
    if (mounted) {
      setState(() => _role = userData?['role'] ?? 'manager');
      await context.read<ThemeProvider>().loadForUser(userData?['id'] as String?);
    }
  }

  bool get _canManageAgents => ['admin','manager','supervisor','super_admin'].contains(_role);

  @override
  Widget build(BuildContext context) {
    final tabs = [
      const ManagerDashboardTab(),
      if (_canManageAgents) const ManagerAgentsTab(),
      const ManagerTasksTab(),
      const ManagerJobsTab(),
      const ManagerWalletTab(),
      const ChatTab(),
      const ManagerProfileTab(),
    ];

    final navItems = [
      const BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded),             label: 'Dashboard'),
      if (_canManageAgents)
        const BottomNavigationBarItem(icon: Icon(Icons.people_rounded),              label: 'Agents'),
      const BottomNavigationBarItem(icon: Icon(Icons.assignment_rounded),             label: 'Tasks'),
      const BottomNavigationBarItem(icon: Icon(Icons.work_rounded),                  label: 'Jobs'),
      const BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet_rounded), label: 'Wallet'),
      const BottomNavigationBarItem(icon: Icon(Icons.chat_bubble_outline_rounded),    label: 'Chat'),
      const BottomNavigationBarItem(icon: Icon(Icons.person_rounded),                 label: 'Profile'),
    ];

    final safeTab = _tab.clamp(0, tabs.length - 1);

    return Scaffold(
      body: IndexedStack(index: safeTab, children: tabs),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: context.appNavBarColor,
          border: Border(top: BorderSide(color: context.appBorderColor, width: 0.5)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, -2))],
        ),
        child: BottomNavigationBar(
          currentIndex: safeTab,
          onTap: (i) {
            setState(() => _tab = i);
            if (i == (navItems.length - 3)) context.read<TasksProvider>().loadTasks();
            if (i == (navItems.length - 2)) context.read<JobsProvider>().loadJobs();
          },
          backgroundColor: context.appNavBarColor,
          selectedItemColor: context.appNavSelected,
          unselectedItemColor: context.appText4,
          selectedFontSize: 10, unselectedFontSize: 10,
          type: BottomNavigationBarType.fixed, elevation: 0,
          items: navItems,
        ),
      ),
    );
  }
}
