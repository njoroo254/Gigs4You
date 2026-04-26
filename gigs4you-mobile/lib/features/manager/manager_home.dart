import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/storage/auth_storage.dart';
import '../../shared/theme/app_theme.dart';
import '../profile/profile_provider.dart';
import '../tasks/tasks_provider.dart';
import '../jobs/jobs_provider.dart';
import 'manager_dashboard_tab.dart';
import 'manager_agents_tab.dart';
import 'manager_tasks_tab.dart';
import 'manager_jobs_tab.dart';
import 'manager_profile_tab.dart';
import '../chat/chat_tab.dart';

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
    if (mounted) setState(() => _role = userData?['role'] ?? 'manager');
  }

  bool get _canCreateJobs => ['admin','manager','employer','super_admin'].contains(_role);
  bool get _canManageAgents => ['admin','manager','supervisor','super_admin'].contains(_role);

  @override
  Widget build(BuildContext context) {
    // Tab indices vary based on role — compute once and pass to dashboard
    final tasksIdx  = _canManageAgents ? 2 : 1;
    final agentsIdx = _canManageAgents ? 1 : -1; // -1 = not available

    final tabs = [
      ManagerDashboardTab(
        onNavigateToTab: (i) => setState(() => _tab = i),
        tasksTabIndex:  tasksIdx,
        agentsTabIndex: agentsIdx,
      ),
      if (_canManageAgents) const ManagerAgentsTab(),
      const ManagerTasksTab(),
      const ManagerJobsTab(),
      const ChatTab(),
      const ManagerProfileTab(),
    ];

    final navItems = [
      const BottomNavigationBarItem(icon: Icon(Icons.dashboard_rounded),  label: 'Dashboard'),
      if (_canManageAgents)
        const BottomNavigationBarItem(icon: Icon(Icons.people_rounded),    label: 'Agents'),
      const BottomNavigationBarItem(icon: Icon(Icons.assignment_rounded),  label: 'Tasks'),
      const BottomNavigationBarItem(icon: Icon(Icons.work_rounded),        label: 'Jobs'),
      const BottomNavigationBarItem(icon: Icon(Icons.chat_bubble_outline_rounded), label: 'Chat'),
      const BottomNavigationBarItem(icon: Icon(Icons.person_rounded),      label: 'Profile'),
    ];

    final safeTab = _tab.clamp(0, tabs.length - 1);

    return Scaffold(
      body: IndexedStack(index: safeTab, children: tabs),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.border, width: 0.5)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha:0.04), blurRadius: 12, offset: const Offset(0, -2))],
        ),
        child: BottomNavigationBar(
          currentIndex: safeTab,
          onTap: (i) {
            setState(() => _tab = i);
            if (i == (navItems.length - 3)) context.read<TasksProvider>().loadTasks();
            if (i == (navItems.length - 2)) context.read<JobsProvider>().loadJobs();
          },
          backgroundColor: Colors.white,
          selectedItemColor: AppColors.primary,
          unselectedItemColor: AppColors.text4,
          selectedFontSize: 10, unselectedFontSize: 10,
          type: BottomNavigationBarType.fixed, elevation: 0,
          items: navItems,
        ),
      ),
    );
  }
}
