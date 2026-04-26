import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';
import '../tasks/tasks_provider.dart';
import '../profile/profile_provider.dart';
import '../gps/gps_provider.dart';
import '../../core/models/models.dart';

class DashboardTab extends StatelessWidget {
  final VoidCallback? onGoToTasks;
  final VoidCallback? onGoToWallet;

  const DashboardTab({super.key, this.onGoToTasks, this.onGoToWallet});

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<ProfileProvider>();
    final tasks   = context.watch<TasksProvider>();
    final gps     = context.watch<GpsProvider>();
    final agent   = profile.agent;

    return Scaffold(
      backgroundColor: context.appSurfaceColor,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () async {
          await Future.wait(<Future<void>>[
            context.read<ProfileProvider>().loadProfile(),
            context.read<TasksProvider>().loadTasks(),
          ]);
        },
        child: CustomScrollView(
          slivers: [
            // ── Header ──────────────────────────────
            SliverAppBar(
              expandedHeight: 160,
              floating: false,
              pinned: true,
              backgroundColor: AppColors.primary,
              actions: [
                Builder(builder: (ctx) {
                  final isDark = ctx.watch<ThemeProvider>().isDark;
                  return IconButton(
                    padding: EdgeInsets.zero,
                    iconSize: 18,
                    tooltip: isDark ? 'Switch to light mode' : 'Switch to dark mode',
                    icon: Icon(
                      isDark ? Icons.wb_sunny_rounded : Icons.nightlight_round,
                      color: Colors.white.withValues(alpha: 0.85),
                      size: 18,
                    ),
                    onPressed: () => ctx.read<ThemeProvider>().toggle(),
                  );
                }),
                const SizedBox(width: 4),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  color: AppColors.primary,
                  padding: const EdgeInsets.fromLTRB(20, 56, 20, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Hello, ${agent?.name.split(' ').first ?? 'Agent'} 👋',
                                  style: const TextStyle(
                                    color: Colors.white, fontSize: 22,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  DateFormat('EEEE, d MMMM').format(DateTime.now()),
                                  style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          // Wallet balance chip
                          GestureDetector(
                            onTap: onGoToWallet,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  const Text('Wallet', style: TextStyle(color: Colors.white70, fontSize: 10)),
                                  Text(
                                    profile.walletDisplay,
                                    style: const TextStyle(
                                      color: Colors.white, fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),

            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([

                  // ── Check-in button ────────────────────
                  _CheckInButton(profile: profile, gps: gps),
                  const SizedBox(height: 16),

                  // ── Stats row ─────────────────────────
                  Row(children: [
                    _StatTile(label: 'Tasks today', value: '${tasks.tasks.length}', color: AppColors.primary),
                    const SizedBox(width: 10),
                    _StatTile(label: 'Done', value: '${tasks.completedTasks.length}', color: AppColors.success),
                    const SizedBox(width: 10),
                    _StatTile(label: 'Rate', value: '${(tasks.tasks.isEmpty ? 0 : (tasks.completedTasks.length * 100 ~/ tasks.tasks.length))}%', color: AppColors.info),
                    const SizedBox(width: 10),
                    _StatTile(label: 'Streak', value: '🔥 ${agent?.currentStreak ?? 0}', color: AppColors.accent, isText: true),
                  ]),
                  const SizedBox(height: 20),

                  // ── High priority task ─────────────────
                  if (tasks.tasks.where((t) => t.priority == 'high' && t.isPending).isNotEmpty) ...[
                    _SectionHeader(title: 'Priority task', actionLabel: 'All tasks', onTap: onGoToTasks ?? () {}),
                    const SizedBox(height: 8),
                    _PriorityTaskCard(
                      task: tasks.tasks.firstWhere((t) => t.priority == 'high' && t.isPending),
                      onOpen: onGoToTasks,
                    ),
                    const SizedBox(height: 20),
                  ] else if (tasks.pendingTasks.isNotEmpty) ...[
                    _SectionHeader(title: 'Next task', actionLabel: 'All tasks', onTap: onGoToTasks ?? () {}),
                    const SizedBox(height: 8),
                    _PriorityTaskCard(task: tasks.pendingTasks.first, onOpen: onGoToTasks),
                    const SizedBox(height: 20),
                  ],

                  // ── Recent Activity (tasks-based) ──────
                  _RecentTasksSection(onViewAll: onGoToTasks),
                  const SizedBox(height: 20),

                  // ── XP Progress ────────────────────────
                  if (agent != null) _XpCard(agent: agent),
                  const SizedBox(height: 8),

                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

}

// ── Section header ────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title, actionLabel;
  final VoidCallback onTap;
  const _SectionHeader({required this.title, required this.actionLabel, required this.onTap});

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: context.appText1)),
      GestureDetector(
        onTap: onTap,
        child: Text(actionLabel, style: const TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w600)),
      ),
    ],
  );
}

// ── Check-in button ───────────────────────────────
class _CheckInButton extends StatelessWidget {
  final ProfileProvider profile;
  final GpsProvider gps;
  const _CheckInButton({required this.profile, required this.gps});

  @override
  Widget build(BuildContext context) {
    final isIn = profile.checkedIn;
    return ElevatedButton.icon(
      onPressed: () async {
        if (isIn) {
          await profile.checkOut();
          gps.stopTracking();
          if (context.mounted) _snack(context, '✅ Checked out. Great work today!', success: true);
        } else {
          final pos = await gps.getCurrentPosition();
          if (pos == null) {
            if (context.mounted) _snack(context, '📍 GPS permission required', success: false);
            return;
          }
          final ok = await profile.checkIn(pos.latitude, pos.longitude);
          if (ok) {
            gps.startTracking();
            if (context.mounted) _snack(context, '✅ Checked in! Have a great day.', success: true);
          }
        }
      },
      icon: Icon(isIn ? Icons.logout_rounded : Icons.login_rounded, size: 20),
      label: Text(isIn ? 'Check Out — End Day' : '● Check In — Start Day'),
      style: ElevatedButton.styleFrom(
        backgroundColor: isIn ? AppColors.danger : AppColors.primary,
        minimumSize: const Size(double.infinity, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  void _snack(BuildContext context, String msg, {required bool success}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: success ? AppColors.success : AppColors.danger,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ));
  }
}

// ── Stat tile ─────────────────────────────────────
class _StatTile extends StatelessWidget {
  final String label, value;
  final Color color;
  final bool isText;
  const _StatTile({required this.label, required this.value, required this.color, this.isText = false});

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.appCardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.appBorderColor, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: TextStyle(fontSize: isText ? 13 : 20, fontWeight: FontWeight.w800, color: context.appText1)),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(fontSize: 10, color: context.appText4)),
        ],
      ),
    ),
  );
}

// ── Priority task card ────────────────────────────
class _PriorityTaskCard extends StatelessWidget {
  final Task task;
  final VoidCallback? onOpen;
  const _PriorityTaskCard({required this.task, this.onOpen});

  @override
  Widget build(BuildContext context) {
    final priorityColor = task.priority == 'high'
      ? AppColors.danger : task.priority == 'medium'
      ? AppColors.accent : AppColors.success;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.appCardColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.appBorderColor, width: 0.5),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(task.title, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: context.appText1))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: priorityColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(task.priority.toUpperCase(),
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: priorityColor)),
              ),
            ],
          ),
          if (task.locationName != null) ...[
            const SizedBox(height: 8),
            Row(children: [
              Icon(Icons.location_on_outlined, size: 13, color: context.appText4),
              const SizedBox(width: 4),
              Text(task.locationName!, style: TextStyle(fontSize: 12, color: context.appText3)),
            ]),
          ],
          if (task.dueAt != null) ...[
            const SizedBox(height: 4),
            Row(children: [
              Icon(Icons.access_time_outlined, size: 13, color: task.isOverdue ? AppColors.danger : AppColors.text4),
              const SizedBox(width: 4),
              Text(
                'Due ${DateFormat('h:mm a').format(task.dueAt!)}',
                style: TextStyle(fontSize: 12, color: task.isOverdue ? AppColors.danger : AppColors.text3),
              ),
            ]),
          ],
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: onOpen,
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(double.infinity, 40),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Open task', style: TextStyle(fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

// ── Recent Tasks (activity feed) ──────────────────
class _RecentTasksSection extends StatelessWidget {
  final VoidCallback? onViewAll;
  const _RecentTasksSection({this.onViewAll});

  static IconData _statusIcon(String status) {
    switch (status) {
      case 'completed':   return Icons.check_circle_outline_rounded;
      case 'in_progress': return Icons.directions_run_rounded;
      case 'failed':      return Icons.cancel_outlined;
      default:            return Icons.hourglass_empty_rounded;
    }
  }

  static Color _statusColor(String status) {
    switch (status) {
      case 'completed':   return AppColors.success;
      case 'in_progress': return AppColors.primary;
      case 'failed':      return AppColors.danger;
      default:            return AppColors.text3;
    }
  }

  static String _statusLabel(String status) {
    switch (status) {
      case 'in_progress': return 'In Progress';
      case 'completed':   return 'Done';
      case 'failed':      return 'Failed';
      default:            return 'Pending';
    }
  }

  @override
  Widget build(BuildContext context) {
    final allTasks = context.watch<TasksProvider>().tasks;
    // Sort by due date descending — most recent / upcoming first
    final recent = [...allTasks]
      ..sort((a, b) => (b.dueAt ?? DateTime(0)).compareTo(a.dueAt ?? DateTime(0)));
    final items = recent.take(5).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Recent activity',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: context.appText1)),
            if (onViewAll != null)
              GestureDetector(
                onTap: onViewAll,
                child: const Text('All tasks',
                  style: TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w600)),
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (items.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: context.appCardColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.appBorderColor, width: 0.5),
            ),
            child: const Column(children: [
              Icon(Icons.assignment_outlined, size: 32, color: AppColors.text4),
              SizedBox(height: 8),
              Text('No tasks yet', style: TextStyle(fontSize: 13, color: AppColors.text4)),
            ]),
          )
        else
          Container(
            decoration: BoxDecoration(
              color: context.appCardColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.appBorderColor, width: 0.5),
            ),
            child: Column(
              children: List.generate(items.length, (i) {
                final t      = items[i];
                final color  = _statusColor(t.status);
                final isLast = i == items.length - 1;
                return Column(
                  children: [
                    InkWell(
                      onTap: onViewAll,
                      borderRadius: i == 0
                        ? const BorderRadius.vertical(top: Radius.circular(12))
                        : isLast
                          ? const BorderRadius.vertical(bottom: Radius.circular(12))
                          : BorderRadius.zero,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        child: Row(
                          children: [
                            Container(
                              width: 34, height: 34,
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.1),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(_statusIcon(t.status), size: 17, color: color),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(t.title,
                                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.appText1),
                                    maxLines: 1, overflow: TextOverflow.ellipsis),
                                  const SizedBox(height: 2),
                                  Text(t.locationName ?? t.status,
                                    style: TextStyle(fontSize: 12, color: context.appText3)),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(_statusLabel(t.status),
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color)),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (!isLast)
                      Divider(height: 1, indent: 60, endIndent: 14, color: context.appBorderColor),
                  ],
                );
              }),
            ),
          ),
      ],
    );
  }
}

// ── XP Card ───────────────────────────────────────
class _XpCard extends StatelessWidget {
  final Agent agent;
  const _XpCard({required this.agent});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        colors: [AppColors.primary, AppColors.primaryLight],
        begin: Alignment.topLeft, end: Alignment.bottomRight,
      ),
      borderRadius: BorderRadius.circular(14),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Level ${agent.level} — ${agent.levelTitle}',
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
            Text('${agent.totalXp} XP total',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12)),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(
            value: agent.levelProgress,
            backgroundColor: Colors.white.withValues(alpha: 0.2),
            valueColor: const AlwaysStoppedAnimation(Colors.white),
            minHeight: 7,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          '${agent.xpForNextLevel - agent.totalXp} XP to Level ${agent.level + 1}',
          style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 11),
        ),
      ],
    ),
  );
}
