import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';
import '../../core/api/api_client.dart';
import '../../core/storage/auth_storage.dart';
import '../tasks/tasks_provider.dart';
import '../profile/profile_provider.dart';
import '../home/dashboard_tab.dart';
import '../chat/chat_tab.dart';
import '../tasks/tasks_tab.dart';
import '../profile/profile_tab.dart';
import '../wallet/agent_wallet_tab.dart';
import '../ai/cathy_screen.dart';

class AgentHome extends StatefulWidget {
  const AgentHome({super.key});
  @override State<AgentHome> createState() => _AgentHomeState();
}

class _AgentHomeState extends State<AgentHome> {
  int _tab = 0;
  int _unreadCount = 0;

  late final List<Widget> _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = [
      DashboardTab(
        onGoToTasks:  () => setState(() => _tab = 1),
        onGoToWallet: () => setState(() => _tab = 2),
      ),
      const TasksTab(),
      const AgentWalletTab(),
      const ChatTab(),
      const ProfileTab(),
    ];
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TasksProvider>().loadTasks();
      context.read<ProfileProvider>().loadProfile();
      _refreshUnread();
    });
    _loadTheme();
  }

  Future<void> _loadTheme() async {
    final userData = await AuthStorage().getUser();
    if (mounted) {
      await context.read<ThemeProvider>().loadForUser(userData?['id'] as String?);
    }
  }

  Future<void> _refreshUnread() async {
    try {
      final count = await ApiClient().getUnreadCount();
      if (mounted) setState(() => _unreadCount = count);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _tab, children: _tabs),
      floatingActionButton: _tab == 0
          ? _CathyPill(
              onTap: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const CathyScreen())),
            )
          : null,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: context.appNavBarColor,
          border: Border(top: BorderSide(color: context.appBorderColor, width: 0.5)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, -2))],
        ),
        child: BottomNavigationBar(
          currentIndex: _tab,
          onTap: (i) {
            setState(() => _tab = i);
            if (i == 1) context.read<TasksProvider>().loadTasks();
            if (i == 3) _refreshUnread();
          },
          backgroundColor: context.appNavBarColor,
          selectedItemColor: context.appNavSelected,
          unselectedItemColor: context.appText4,
          selectedFontSize: 11, unselectedFontSize: 11,
          type: BottomNavigationBarType.fixed, elevation: 0,
          items: [
            const BottomNavigationBarItem(icon: Icon(Icons.home_rounded),                  label: 'Home'),
            const BottomNavigationBarItem(icon: Icon(Icons.assignment_rounded),             label: 'Tasks'),
            const BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet_rounded), label: 'Wallet'),
            BottomNavigationBarItem(
              label: 'Chat',
              icon: _BadgedIcon(
                icon: Icons.chat_bubble_outline_rounded,
                count: _unreadCount,
              ),
            ),
            const BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}

// ── Green pill FAB matching the dashboard's "Ask Cathy ✨" button ──────────
class _CathyPill extends StatelessWidget {
  final VoidCallback onTap;
  const _CathyPill({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF1B6B3A), Color(0xFF2E8B57)],
            begin: Alignment.topLeft, end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(30),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF1B6B3A).withValues(alpha: 0.45),
              blurRadius: 16, offset: const Offset(0, 6),
            ),
          ],
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.smart_toy_rounded, color: Colors.white, size: 18),
            SizedBox(width: 7),
            Text('Ask Cathy ✨',
              style: TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.2,
              )),
          ],
        ),
      ),
    );
  }
}

// ── Chat icon with unread badge ────────────────────────────────────────────
class _BadgedIcon extends StatelessWidget {
  final IconData icon;
  final int count;
  const _BadgedIcon({required this.icon, required this.count});

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Icon(icon),
        if (count > 0)
          Positioned(
            top: -4, right: -6,
            child: Container(
              padding: count > 9
                ? const EdgeInsets.symmetric(horizontal: 4, vertical: 1)
                : const EdgeInsets.all(3),
              decoration: const BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
              child: Text(
                count > 99 ? '99+' : '$count',
                style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700),
                textAlign: TextAlign.center,
              ),
            ),
          ),
      ],
    );
  }
}
