import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';
import '../../core/storage/auth_storage.dart';
import '../jobs/jobs_provider.dart';
import '../profile/profile_provider.dart';
import '../jobs/jobs_tab.dart';
import '../chat/chat_tab.dart';
import '../profile/profile_tab.dart';
import '../wallet/agent_wallet_tab.dart';
import '../ai/cathy_screen.dart';

class WorkerHome extends StatefulWidget {
  const WorkerHome({super.key});
  @override State<WorkerHome> createState() => _WorkerHomeState();
}

class _WorkerHomeState extends State<WorkerHome> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<JobsProvider>().loadJobs();
      context.read<ProfileProvider>().loadProfile();
    });
    _loadTheme();
  }

  Future<void> _loadTheme() async {
    final userData = await AuthStorage().getUser();
    if (mounted) {
      await context.read<ThemeProvider>().loadForUser(userData?['id'] as String?);
    }
  }

  @override
  Widget build(BuildContext context) {
    const tabs = [JobsTab(), AgentWalletTab(), ChatTab(), ProfileTab()];

    return Scaffold(
      body: IndexedStack(index: _tab, children: tabs),
      floatingActionButton: _tab == 0
          ? FloatingActionButton(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CathyScreen())),
              backgroundColor: AppColors.primary,
              tooltip: 'Ask Cathy',
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: const Text('C', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
            )
          : null,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: context.appNavBarColor,
          border: Border(top: BorderSide(color: context.appBorderColor, width: 0.5)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0,-2))],
        ),
        child: BottomNavigationBar(
          currentIndex: _tab,
          onTap: (i) {
            setState(() => _tab = i);
            if (i == 0) context.read<JobsProvider>().loadJobs();
          },
          backgroundColor: context.appNavBarColor,
          selectedItemColor: context.appNavSelected,
          unselectedItemColor: context.appText4,
          selectedFontSize: 11, unselectedFontSize: 11,
          type: BottomNavigationBarType.fixed, elevation: 0,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.work_rounded),                    label: 'Jobs'),
            BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet_rounded),   label: 'Wallet'),
            BottomNavigationBarItem(icon: Icon(Icons.chat_bubble_outline_rounded),      label: 'Chat'),
            BottomNavigationBarItem(icon: Icon(Icons.person_rounded),                   label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
