import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../tasks/tasks_provider.dart';
import '../profile/profile_provider.dart';
import '../home/dashboard_tab.dart';
import '../chat/chat_tab.dart';
import '../tasks/tasks_tab.dart';
import '../jobs/jobs_tab.dart';
import '../jobs/jobs_provider.dart';
import '../profile/profile_tab.dart';

class AgentHome extends StatefulWidget {
  const AgentHome({super.key});
  @override State<AgentHome> createState() => _AgentHomeState();
}

class _AgentHomeState extends State<AgentHome> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TasksProvider>().loadTasks();
      context.read<ProfileProvider>().loadProfile();
      context.read<JobsProvider>().loadJobs();
    });
  }

  void _navigateTo(int index) => setState(() => _tab = index);

  @override
  Widget build(BuildContext context) {
    final tabs = [
      DashboardTab(onNavigateToTab: _navigateTo),
      const TasksTab(),
      const JobsTab(),
      const ChatTab(),
      const ProfileTab(),
    ];

    return Scaffold(
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.border, width: 0.5)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha:0.04), blurRadius: 8, offset: const Offset(0, -2))],
        ),
        child: BottomNavigationBar(
          currentIndex: _tab,
          onTap: (i) {
            setState(() => _tab = i);
            if (i == 1) context.read<TasksProvider>().loadTasks();
            if (i == 2) context.read<JobsProvider>().loadJobs();
          },
          backgroundColor: Colors.white,
          selectedItemColor: AppColors.primary,
          unselectedItemColor: AppColors.text4,
          selectedFontSize: 11, unselectedFontSize: 11,
          type: BottomNavigationBarType.fixed, elevation: 0,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.home_rounded),               label: 'Home'),
            BottomNavigationBarItem(icon: Icon(Icons.assignment_rounded),          label: 'Tasks'),
            BottomNavigationBarItem(icon: Icon(Icons.work_outline_rounded),        label: 'Jobs'),
            BottomNavigationBarItem(icon: Icon(Icons.chat_bubble_outline_rounded), label: 'Chat'),
            BottomNavigationBarItem(icon: Icon(Icons.person_rounded),              label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
