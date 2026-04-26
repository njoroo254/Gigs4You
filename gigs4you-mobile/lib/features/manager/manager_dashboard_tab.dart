import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../profile/profile_provider.dart';
import '../auth/auth_provider.dart';

class ManagerDashboardTab extends StatefulWidget {
  final void Function(int)? onNavigateToTab;
  final int tasksTabIndex;
  final int agentsTabIndex;
  const ManagerDashboardTab({
    super.key,
    this.onNavigateToTab,
    this.tasksTabIndex  = 2,
    this.agentsTabIndex = 1,
  });
  @override State<ManagerDashboardTab> createState() => _ManagerDashboardTabState();
}

class _ManagerDashboardTabState extends State<ManagerDashboardTab> {
  Map<String, dynamic> _stats = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _loading = true);
    try {
      final api = context.read<ApiClient>();
      final stats = await api.getTaskStats();
      setState(() { _stats = stats; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<ProfileProvider>();
    final agent   = profile.agent;
    final auth    = context.read<AuthProvider>();

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _loadStats,
        child: CustomScrollView(slivers: [
          SliverAppBar(
            pinned: true, expandedHeight: 140,
            backgroundColor: AppColors.dark,
            actions: [
              IconButton(
                icon: const Icon(Icons.logout, color: Colors.white70, size: 20),
                onPressed: () => auth.logout(context),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                color: AppColors.dark,
                padding: const EdgeInsets.fromLTRB(20, 60, 20, 16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Container(
                      width: 40, height: 40, decoration: BoxDecoration(
                        color: AppColors.primary, borderRadius: BorderRadius.circular(10)),
                      child: Center(child: Text(agent?.initials ?? 'M',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16))),
                    ),
                    const SizedBox(width: 10),
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(agent?.name ?? 'Manager', style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700)),
                      Text(agent?.user?.roleDisplay ?? 'Manager', style: TextStyle(color: Colors.white.withValues(alpha:0.5), fontSize: 12)),
                    ]),
                  ]),
                ]),
              ),
            ),
          ),

          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverList(delegate: SliverChildListDelegate([

              // Stats grid
              const Text('Overview', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.4)),
              const SizedBox(height: 10),
              GridView.count(
                crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 2,
                children: [
                  _StatTile('Total Tasks', '${_stats['total'] ?? 0}', AppColors.primary),
                  _StatTile('Completed', '${_stats['completed'] ?? 0}', Colors.green),
                  _StatTile('Pending', '${_stats['pending'] ?? 0}', Colors.amber.shade700),
                  _StatTile('Success Rate', '${_stats['completionRate'] ?? 0}%', AppColors.info),
                ],
              ),
              const SizedBox(height: 20),

              // Quick actions
              const Text('Quick actions', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.4)),
              const SizedBox(height: 10),
              Row(children: [
                _QuickAction(
                  icon: Icons.add_task, label: 'Create Task', color: AppColors.primary,
                  onTap: () => widget.onNavigateToTab?.call(widget.tasksTabIndex),
                ),
                const SizedBox(width: 10),
                _QuickAction(
                  icon: Icons.people, label: 'View Agents', color: AppColors.info,
                  onTap: () {
                    if (widget.agentsTabIndex >= 0) {
                      widget.onNavigateToTab?.call(widget.agentsTabIndex);
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text('Agents tab not available for your role'),
                        behavior: SnackBarBehavior.floating,
                      ));
                    }
                  },
                ),
                const SizedBox(width: 10),
                _QuickAction(
                  icon: Icons.bar_chart, label: 'Reports', color: Colors.purple,
                  onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Full reports available on the web dashboard'),
                    behavior: SnackBarBehavior.floating,
                  )),
                ),
              ]),
              const SizedBox(height: 20),

              // Open the full dashboard note
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.primaryPale,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.primary.withValues(alpha:0.2)),
                ),
                child: Row(children: [
                  const Icon(Icons.open_in_browser, color: AppColors.primary, size: 20),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Full admin dashboard', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 13)),
                    const SizedBox(height: 2),
                    Text('Open localhost:3001 on your PC for the complete management dashboard with reports, GPS tracking and billing.',
                      style: TextStyle(fontSize: 11, color: AppColors.primary.withValues(alpha:0.7), height: 1.5)),
                  ])),
                ]),
              ),

            ])),
          ),
        ]),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label, value;
  final Color color;
  const _StatTile(this.label, this.value, this.color);

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppColors.border, width: 0.5)),
    child: Row(children: [
      Container(width: 4, height: 32, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
      const SizedBox(width: 10),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: const TextStyle(fontSize: 10, color: AppColors.text4,
          fontWeight: FontWeight.w500, letterSpacing: 0.3)),
      ]),
    ]),
  );
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) => Expanded(
    child: GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withValues(alpha:0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha:0.2)),
        ),
        child: Column(children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 5),
          Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
        ]),
      ),
    ),
  );
}
