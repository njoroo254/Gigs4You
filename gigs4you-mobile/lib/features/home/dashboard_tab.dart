import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/ai_chat_widget.dart';
import '../tasks/tasks_provider.dart';
import '../profile/profile_provider.dart';
import '../gps/gps_provider.dart';
import '../jobs/jobs_provider.dart';
import '../../core/models/models.dart';
import '../../core/api/api_client.dart';

class DashboardTab extends StatelessWidget {
  final void Function(int) onNavigateToTab;
  const DashboardTab({super.key, required this.onNavigateToTab});

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<ProfileProvider>();
    final tasks = context.watch<TasksProvider>();
    final jobs = context.watch<JobsProvider>();
    final gps = context.watch<GpsProvider>();
    final agent = profile.agent;

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: Stack(
        children: [
      RefreshIndicator(
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
                                    color: Colors.white,
                                    fontSize: 22,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  DateFormat('EEEE, d MMMM')
                                      .format(DateTime.now()),
                                  style: TextStyle(
                                      color:
                                          Colors.white.withValues(alpha: 0.7),
                                      fontSize: 13),
                                ),
                              ],
                            ),
                          ),
                          // Wallet balance chip — tap goes to Profile
                          GestureDetector(
                            onTap: () => onNavigateToTab(4),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                    color: Colors.white.withValues(alpha: 0.2)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  const Text('Wallet',
                                      style: TextStyle(
                                          color: Colors.white70, fontSize: 10)),
                                  Text(
                                    profile.walletDisplay,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 15,
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
                    _StatTile(
                        label: 'Tasks today',
                        value: '${tasks.tasks.length}',
                        color: AppColors.primary),
                    const SizedBox(width: 10),
                    _StatTile(
                        label: 'Done',
                        value: '${tasks.completedTasks.length}',
                        color: AppColors.success),
                    const SizedBox(width: 10),
                    _StatTile(
                        label: 'Rate',
                        value:
                            '${(tasks.tasks.isEmpty ? 0 : (tasks.completedTasks.length * 100 ~/ tasks.tasks.length))}%',
                        color: AppColors.info),
                    const SizedBox(width: 10),
                    _StatTile(
                        label: 'Streak',
                        value: '🔥 ${agent?.currentStreak ?? 0}',
                        color: AppColors.accent,
                        isText: true),
                  ]),
                  const SizedBox(height: 20),

                  // ── High priority task ─────────────────
                  if (tasks.tasks
                      .where((t) => t.priority == 'high' && t.isPending)
                      .isNotEmpty) ...[
                    _SectionHeader(
                        title: 'Priority task',
                        actionLabel: 'All tasks',
                        onTap: () => onNavigateToTab(1)),
                    const SizedBox(height: 8),
                    _PriorityTaskCard(
                        task: tasks.tasks.firstWhere(
                            (t) => t.priority == 'high' && t.isPending),
                        onOpen: () => onNavigateToTab(1)),
                    const SizedBox(height: 20),
                  ] else if (tasks.pendingTasks.isNotEmpty) ...[
                    _SectionHeader(
                        title: 'Next task',
                        actionLabel: 'All tasks',
                        onTap: () => onNavigateToTab(1)),
                    const SizedBox(height: 8),
                    _PriorityTaskCard(
                        task: tasks.pendingTasks.first,
                        onOpen: () => onNavigateToTab(1)),
                    const SizedBox(height: 20),
                  ],

                  // ── Urgent jobs ────────────────────────
                  _SectionHeader(
                    title: '🚨 Urgent jobs nearby',
                    actionLabel: 'View all',
                    onTap: () => onNavigateToTab(2),
                  ),
                  const SizedBox(height: 8),
                  if (jobs.jobs.isEmpty)
                    _buildJobPlaceholders()
                  else
                    ...jobs.urgentJobs.take(2).map((j) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _JobCard(job: j),
                        )),
                  const SizedBox(height: 20),

                  // ── Recent Activity ────────────────────
                  _SectionHeader(
                    title: 'Recent activity',
                    actionLabel: 'View all',
                    onTap: () => onNavigateToTab(4),
                  ),
                  const SizedBox(height: 8),
                  const _ActivityFeed(),
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
      const Positioned(
        bottom: 24,
        right: 16,
        child: const AIChatWidget(),
      ),
        ],
      ),
      floatingActionButton: null,
    );
  }

  Widget _buildJobPlaceholders() {
    return Column(children: [
      _JobCard(
          job: Job(
        id: 'p1',
        title: 'Loading jobs...',
        description: '',
        category: 'general',
        requiredSkills: [],
        budgetMin: 0,
        budgetMax: 0,
        budgetType: 'fixed',
        location: '',
        status: 'open',
        postedAt: DateTime.now(),
        postedBy: '',
        isUrgent: true,
      )),
    ]);
  }
}

// ── Section header ────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String title, actionLabel;
  final VoidCallback onTap;
  const _SectionHeader(
      {required this.title, required this.actionLabel, required this.onTap});

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.text1)),
          GestureDetector(
            onTap: onTap,
            child: Text(actionLabel,
                style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600)),
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
          if (context.mounted)
            _snack(context, '✅ Checked out. Great work today!', success: true);
        } else {
          final pos = await gps.getCurrentPosition();
          if (pos == null) {
            if (context.mounted)
              _snack(context, '📍 GPS permission required', success: false);
            return;
          }
          final ok = await profile.checkIn(pos.latitude, pos.longitude);
          if (ok) {
            gps.startTracking();
            if (context.mounted)
              _snack(context, '✅ Checked in! Have a great day.', success: true);
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
  const _StatTile(
      {required this.label,
      required this.value,
      required this.color,
      this.isText = false});

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border, width: 0.5),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value,
                  style: TextStyle(
                      fontSize: isText ? 13 : 20,
                      fontWeight: FontWeight.w800,
                      color: AppColors.text1)),
              const SizedBox(height: 2),
              Text(label,
                  style: const TextStyle(fontSize: 10, color: AppColors.text4)),
            ],
          ),
        ),
      );
}

// ── Priority task card ────────────────────────────
class _PriorityTaskCard extends StatelessWidget {
  final Task task;
  final VoidCallback onOpen;
  const _PriorityTaskCard({required this.task, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final priorityColor = task.priority == 'high'
        ? AppColors.danger
        : task.priority == 'medium'
            ? AppColors.accent
            : AppColors.success;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border, width: 0.5),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text(task.title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                          color: AppColors.text1))),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: priorityColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(task.priority.toUpperCase(),
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: priorityColor)),
              ),
            ],
          ),
          if (task.locationName != null) ...[
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.location_on_outlined,
                  size: 13, color: AppColors.text4),
              const SizedBox(width: 4),
              Text(task.locationName!,
                  style: const TextStyle(fontSize: 12, color: AppColors.text3)),
            ]),
          ],
          if (task.dueAt != null) ...[
            const SizedBox(height: 4),
            Row(children: [
              Icon(Icons.access_time_outlined,
                  size: 13,
                  color: task.isOverdue ? AppColors.danger : AppColors.text4),
              const SizedBox(width: 4),
              Text(
                'Due ${DateFormat('h:mm a').format(task.dueAt!)}',
                style: TextStyle(
                    fontSize: 12,
                    color: task.isOverdue ? AppColors.danger : AppColors.text3),
              ),
            ]),
          ],
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: onOpen,
            style: ElevatedButton.styleFrom(
              minimumSize: const Size(double.infinity, 40),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('Open task', style: TextStyle(fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

// ── Job card ──────────────────────────────────────
class _JobCard extends StatelessWidget {
  final Job job;
  const _JobCard({required this.job});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: job.isUrgent
              ? AppColors.danger.withValues(alpha: 0.3)
              : AppColors.border,
          width: job.isUrgent ? 1 : 0.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (job.isUrgent)
                Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.dangerLight,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text('URGENT',
                      style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: AppColors.danger)),
                ),
              Expanded(
                  child: Text(job.title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                          color: AppColors.text1),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis)),
            ],
          ),
          const SizedBox(height: 6),
          Row(children: [
            const Icon(Icons.location_on_outlined,
                size: 12, color: AppColors.text4),
            const SizedBox(width: 3),
            Text(job.location,
                style: const TextStyle(fontSize: 11, color: AppColors.text3)),
            const Spacer(),
            Text(job.budgetDisplay,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary)),
            Text(' / ${job.budgetType}',
                style: const TextStyle(fontSize: 11, color: AppColors.text4)),
          ]),
          if (job.requiredSkills.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              children: job.requiredSkills
                  .take(3)
                  .map((s) => Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Text(s,
                            style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.text2,
                                fontWeight: FontWeight.w500)),
                      ))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Activity Feed ─────────────────────────────────
class _ActivityFeed extends StatefulWidget {
  const _ActivityFeed();

  @override
  State<_ActivityFeed> createState() => _ActivityFeedState();
}

class _ActivityFeedState extends State<_ActivityFeed> {
  List<AppNotification> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<ApiClient>();
    final raw = await api.getNotifications();
    if (!mounted) return;
    setState(() {
      _items = raw
          .take(5)
          .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
          .toList();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
        height: 60,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (_items.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border, width: 0.5),
        ),
        child: const Row(
          children: [
            Icon(Icons.notifications_none_rounded, size: 18, color: AppColors.text4),
            SizedBox(width: 10),
            Text('No recent activity', style: TextStyle(fontSize: 13, color: AppColors.text3)),
          ],
        ),
      );
    }
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border, width: 0.5),
      ),
      child: Column(
        children: _items.asMap().entries.map((entry) {
          final i = entry.key;
          final n = entry.value;
          return Column(
            children: [
              _NotifRow(notification: n),
              if (i < _items.length - 1)
                const Divider(height: 1, indent: 46, endIndent: 0, color: AppColors.border),
            ],
          );
        }).toList(),
      ),
    );
  }
}

class _NotifRow extends StatelessWidget {
  final AppNotification notification;
  const _NotifRow({required this.notification});

  static IconData _icon(String type) => switch (type) {
    'task'    => Icons.check_circle_outline_rounded,
    'payment' => Icons.payments_outlined,
    'job'     => Icons.work_outline_rounded,
    'warning' => Icons.warning_amber_rounded,
    'system'  => Icons.smart_toy_rounded,
    _         => Icons.notifications_outlined,
  };

  static Color _color(String type) => switch (type) {
    'task'    => AppColors.success,
    'payment' => AppColors.primary,
    'job'     => AppColors.info,
    'warning' => AppColors.accent,
    'system'  => const Color(0xFF1B6B3A),
    _         => AppColors.text3,
  };

  String _relativeTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1)  return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24)   return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final color = _color(notification.type);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(_icon(notification.type), size: 16, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  notification.title,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: notification.isRead ? FontWeight.w500 : FontWeight.w700,
                    color: AppColors.text1,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  notification.body,
                  style: const TextStyle(fontSize: 12, color: AppColors.text3),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _relativeTime(notification.createdAt),
            style: const TextStyle(fontSize: 10, color: AppColors.text4),
          ),
        ],
      ),
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
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
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
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
                Text('${agent.totalXp} XP total',
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 12)),
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
              style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.7), fontSize: 11),
            ),
          ],
        ),
      );
}
