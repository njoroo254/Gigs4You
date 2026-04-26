import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/models/models.dart';
import '../../shared/theme/app_theme.dart';
import 'tasks_provider.dart';

class TasksTab extends StatefulWidget {
  const TasksTab({super.key});
  @override State<TasksTab> createState() => _TasksTabState();
}

class _TasksTabState extends State<TasksTab> {
  Timer? _clockTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TasksProvider>().loadTasks();
    });
    // Tick every second to update countdown timers
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() { _clockTimer?.cancel(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TasksProvider>();
    final filters  = ['all', 'pending', 'in_progress', 'completed', 'failed'];

    // Separate tasks needing acceptance from the rest
    final needsAcceptance = provider.tasks.where((t) => t.needsAcceptance).toList();
    final regular = provider.filtered.where((t) => !t.needsAcceptance).toList();

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => context.read<TasksProvider>().loadTasks(),
        child: CustomScrollView(slivers: [
          // ── App bar ──────────────────────────────
          SliverAppBar(
            pinned: true,
            backgroundColor: AppColors.dark,
            expandedHeight: 130,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                color: AppColors.dark,
                padding: const EdgeInsets.fromLTRB(20, 56, 20, 0),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('My Tasks', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text(
                    '${provider.pendingTasks.length} pending · ${provider.inProgressTasks.length} active · ${provider.completedTasks.length} done',
                    style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 12)),
                ]),
              ),
            ),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(42),
              child: Container(
                color: AppColors.dark, height: 42,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
                  children: filters.map((f) {
                    final active = provider.statusFilter == f;
                    return GestureDetector(
                      onTap: () => provider.setFilter(f),
                      child: Container(
                        margin: const EdgeInsets.only(right: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: active ? AppColors.primary : Colors.white.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(99)),
                        child: Text(
                          f == 'all' ? 'All' : f == 'in_progress' ? 'Active' : f[0].toUpperCase() + f.substring(1),
                          style: TextStyle(color: active ? Colors.white : Colors.white.withOpacity(0.5),
                            fontSize: 11, fontWeight: FontWeight.w600)),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
          ),

          if (provider.loading)
            const SliverFillRemaining(child: Center(child: CircularProgressIndicator()))
          else if (provider.tasks.isEmpty)
            SliverFillRemaining(
              child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.assignment_outlined, size: 52, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                const Text('No tasks assigned yet', style: TextStyle(color: AppColors.text3, fontSize: 15, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                const Text('Pull to refresh', style: TextStyle(color: AppColors.text4, fontSize: 12)),
              ])),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
              sliver: SliverList(delegate: SliverChildListDelegate([

                // ── Acceptance required banner ──────
                if (needsAcceptance.isNotEmpty && provider.statusFilter == 'all') ...[
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF8E1),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFFCD34D))),
                    child: Row(children: [
                      const Icon(Icons.alarm_rounded, color: Color(0xFFF59E0B), size: 18),
                      const SizedBox(width: 8),
                      Expanded(child: Text(
                        '${needsAcceptance.length} task${needsAcceptance.length > 1 ? 's' : ''} awaiting your acceptance',
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF92400E)))),
                    ]),
                  ),
                  ...needsAcceptance.map((t) => _TaskCard(task: t, provider: provider, showAcceptance: true)),
                  const Divider(height: 20),
                ],

                // ── Regular tasks ────────────────────
                if (regular.isEmpty && provider.tasks.isNotEmpty)
                  Center(child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text('No ${provider.statusFilter} tasks',
                      style: const TextStyle(color: AppColors.text4, fontSize: 14)),
                  ))
                else
                  ...regular.map((t) => _TaskCard(task: t, provider: provider, showAcceptance: false)),
              ])),
            ),
        ]),
      ),
    );
  }
}

// ── Task card ─────────────────────────────────────────
class _TaskCard extends StatelessWidget {
  final Task task;
  final TasksProvider provider;
  final bool showAcceptance;
  const _TaskCard({required this.task, required this.provider, required this.showAcceptance});

  @override
  Widget build(BuildContext context) {
    final priorityColor = task.priority == 'high' ? Colors.red
      : task.priority == 'medium' ? Colors.amber : Colors.grey;

    return GestureDetector(
      onTap: () => _showDetail(context),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: showAcceptance ? const Color(0xFFFCD34D) :
                   task.isOverdue ? Colors.red.shade200 : AppColors.border,
            width: showAcceptance ? 1.5 : 0.5),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0,2))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Priority strip
          Container(height: 3, decoration: BoxDecoration(
            color: priorityColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(14)))),

          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

              // Title + status
              Row(children: [
                Expanded(child: Text(task.title,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  maxLines: 2, overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 8),
                _StatusBadge(task.status),
              ]),

              if (task.description != null && task.description!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(task.description!, style: const TextStyle(color: AppColors.text3, fontSize: 12, height: 1.5),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
              ],

              const SizedBox(height: 10),

              // Meta row
              Row(children: [
                if (task.locationName != null) ...[
                  const Icon(Icons.location_on, size: 12, color: AppColors.text4),
                  const SizedBox(width: 3),
                  Flexible(child: Text(task.locationName!, style: const TextStyle(fontSize: 11, color: AppColors.text4), overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 10),
                ],
                if (task.dueAt != null) ...[
                  Icon(task.isOverdue ? Icons.warning_amber : Icons.access_time,
                    size: 12, color: task.isOverdue ? Colors.red : AppColors.text4),
                  const SizedBox(width: 3),
                  Text(_formatDate(task.dueAt!),
                    style: TextStyle(fontSize: 11, color: task.isOverdue ? Colors.red : AppColors.text4,
                      fontWeight: task.isOverdue ? FontWeight.w600 : FontWeight.normal)),
                ],
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: AppColors.primaryPale, borderRadius: BorderRadius.circular(99)),
                  child: Text('+${task.xpReward} XP',
                    style: const TextStyle(color: AppColors.primary, fontSize: 10, fontWeight: FontWeight.w700))),
              ]),

              // Acceptance countdown timer
              if (showAcceptance && task.timeToAccept != null) ...[
                const SizedBox(height: 10),
                _AcceptanceTimer(task: task, provider: provider),
              ],

              // Action buttons
              if (!showAcceptance && (task.isPending || task.isInProgress)) ...[
                const SizedBox(height: 12),
                const Divider(height: 1, color: AppColors.border),
                const SizedBox(height: 10),
                Row(children: [
                  if (task.isPending && task.isAccepted)
                    Expanded(child: _ActionBtn(
                      label: 'Start', color: AppColors.info, icon: Icons.play_arrow,
                      onTap: () => _startTask(context))),
                  if (task.isInProgress) ...[
                    Expanded(child: _ActionBtn(
                      label: 'Complete', color: AppColors.primary, icon: Icons.check_circle,
                      onTap: () => _completeTask(context))),
                    const SizedBox(width: 8),
                    Expanded(child: _ActionBtn(
                      label: 'Fail', color: Colors.red, icon: Icons.cancel,
                      onTap: () => _failTask(context))),
                  ],
                  if (task.isPending && !task.isAccepted)
                    Expanded(child: _ActionBtn(
                      label: 'Accept', color: AppColors.info, icon: Icons.check_circle_outline,
                      onTap: () => _acceptTask(context))),
                ]),
              ],
            ]),
          ),
        ]),
      ),
    );
  }

  String _formatDate(DateTime d) {
    final diff = d.difference(DateTime.now());
    if (diff.inDays == 0) return 'Today ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
    if (diff.inDays == 1) return 'Tomorrow';
    if (diff.inDays < 0) return 'Overdue ${(-diff.inDays)}d';
    return '${d.day}/${d.month}';
  }

  Future<void> _acceptTask(BuildContext context) async {
    final ok = await provider.acceptTask(task.id);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok ? '✅ Task accepted!' : 'Failed: ${provider.error}'),
        backgroundColor: ok ? AppColors.info : Colors.red,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ));
    }
  }

  Future<void> _startTask(BuildContext context) async {
    final ok = await provider.startTask(task.id);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok ? '▶ Task started!' : 'Failed: ${provider.error}'),
        backgroundColor: ok ? AppColors.primary : Colors.red));
    }
  }

  Future<void> _completeTask(BuildContext context) async {
    final notesCtrl = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context, isScrollControlled: true, backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Complete task', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('Task: ${task.title}', style: const TextStyle(color: AppColors.text3, fontSize: 13)),
          const SizedBox(height: 16),
          TextField(controller: notesCtrl, maxLines: 3, decoration: InputDecoration(
            hintText: 'Notes (optional)...', border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.all(12))),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel'))),
            const SizedBox(width: 12),
            Expanded(child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Submit'))),
          ]),
        ]),
      ),
    );
    if (confirmed == true && context.mounted) {
      final ok = await provider.completeTask(task.id, notes: notesCtrl.text.isEmpty ? null : notesCtrl.text);
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok ? '🎉 +${task.xpReward} XP earned!' : 'Failed: ${provider.error}'),
        backgroundColor: ok ? AppColors.primary : Colors.red));
    }
  }

  Future<void> _failTask(BuildContext context) async {
    final ctrl = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context, isScrollControlled: true, backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Report failed', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Colors.red)),
          const SizedBox(height: 14),
          TextField(controller: ctrl, maxLines: 2, decoration: InputDecoration(
            hintText: 'Reason for failure',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.all(12))),
          const SizedBox(height: 14),
          SizedBox(width: double.infinity, child: ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Report failed'))),
        ]),
      ),
    );
    if (confirmed == true && context.mounted) {
      await provider.failTask(task.id, ctrl.text.isEmpty ? 'No reason given' : ctrl.text);
    }
  }

  void _showDetail(BuildContext context) {
    showModalBottomSheet(
      context: context, isScrollControlled: true, backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.6, maxChildSize: 0.92, minChildSize: 0.4, expand: false,
        builder: (__, ctrl) => ListView(controller: ctrl, padding: const EdgeInsets.all(20), children: [
          Center(child: Container(width: 36, height: 4, margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)))),
          Row(children: [
            Expanded(child: Text(task.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            _StatusBadge(task.status),
          ]),
          const SizedBox(height: 16),
          if (task.description != null)
            Text(task.description!, style: const TextStyle(color: AppColors.text2, fontSize: 14, height: 1.6)),
          const SizedBox(height: 16),
          if (task.locationName != null)
            _DetailRow(icon: Icons.location_on, label: 'Location', value: task.locationName!),
          if (task.dueAt != null)
            _DetailRow(icon: Icons.schedule, label: 'Due', value: task.dueAt!.toString().substring(0, 16)),
          _DetailRow(icon: Icons.star, label: 'XP reward', value: '+${task.xpReward} XP'),
          _DetailRow(icon: Icons.flag, label: 'Priority', value: task.priority.toUpperCase()),
          if (task.acceptanceStatus != null)
            _DetailRow(icon: Icons.how_to_reg, label: 'Acceptance', value: task.acceptanceStatus!),
          if (task.notes != null && task.notes!.isNotEmpty)
            _DetailRow(icon: Icons.notes, label: 'Notes', value: task.notes!),
        ]),
      ),
    );
  }
}

// ── Acceptance timer widget ───────────────────────────
class _AcceptanceTimer extends StatelessWidget {
  final Task task;
  final TasksProvider provider;
  const _AcceptanceTimer({required this.task, required this.provider});

  String _formatDuration(Duration d) {
    if (d <= Duration.zero) return 'Expired';
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    if (h > 0) return '${h}h ${m}m remaining';
    if (m > 0) return '${m}m ${s}s remaining';
    return '${s}s remaining';
  }

  @override
  Widget build(BuildContext context) {
    final timeLeft = task.timeToAccept;
    final isExpiring = timeLeft != null && timeLeft.inMinutes < 30;
    final isExpired  = timeLeft != null && timeLeft <= Duration.zero;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Timer bar
      Row(children: [
        Icon(isExpired ? Icons.alarm_off : Icons.alarm_rounded,
          size: 14, color: isExpired ? Colors.red : isExpiring ? Colors.orange : const Color(0xFFF59E0B)),
        const SizedBox(width: 6),
        Text(
          isExpired ? 'Acceptance deadline passed' : _formatDuration(timeLeft ?? Duration.zero),
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
            color: isExpired ? Colors.red : isExpiring ? Colors.orange : const Color(0xFF92400E))
        ),
      ]),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: GestureDetector(
          onTap: () async {
            final ok = await provider.acceptTask(task.id);
            if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(ok ? '✓ Task accepted!' : 'Failed: ${provider.error}'),
              backgroundColor: ok ? AppColors.primary : Colors.red));
          },
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.primary, borderRadius: BorderRadius.circular(8)),
            child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.check, color: Colors.white, size: 16),
              SizedBox(width: 6),
              Text('Accept task', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
            ])),
        )),
        const SizedBox(width: 8),
        Expanded(child: GestureDetector(
          onTap: () async {
            final reasonCtrl = TextEditingController();
            final confirmed = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: const Text('Decline task'),
                content: TextField(controller: reasonCtrl,
                  decoration: const InputDecoration(hintText: 'Reason (optional)')),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                  TextButton(onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Decline', style: TextStyle(color: Colors.red))),
                ],
              ),
            );
            if (confirmed == true && context.mounted) {
              await provider.declineTask(task.id, reasonCtrl.text.isEmpty ? 'Declined by agent' : reasonCtrl.text);
            }
          },
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white, borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.red.shade300)),
            child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.close, color: Colors.red, size: 16),
              SizedBox(width: 6),
              Text('Decline', style: TextStyle(color: Colors.red, fontWeight: FontWeight.w700, fontSize: 13)),
            ])),
        )),
      ]),
    ]);
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge(this.status);
  @override
  Widget build(BuildContext context) {
    final cfg = {
      'pending':     [Colors.amber.shade100,  Colors.amber.shade800],
      'in_progress': [Colors.blue.shade100,   Colors.blue.shade800],
      'completed':   [AppColors.primaryPale,  AppColors.primary],
      'failed':      [Colors.red.shade100,    Colors.red.shade800],
      'cancelled':   [Colors.grey.shade100,   Colors.grey.shade600],
    }[status] ?? [Colors.grey.shade100, Colors.grey.shade600];
    final label = status == 'in_progress' ? 'Active' : status[0].toUpperCase() + status.substring(1);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: cfg[0], borderRadius: BorderRadius.circular(99)),
      child: Text(label, style: TextStyle(color: cfg[1], fontSize: 10, fontWeight: FontWeight.w700)));
  }
}

class _ActionBtn extends StatelessWidget {
  final String label; final Color color; final IconData icon; final VoidCallback onTap;
  const _ActionBtn({required this.label, required this.color, required this.icon, required this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3))),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 5),
        Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      ])));
}

class _DetailRow extends StatelessWidget {
  final IconData icon; final String label, value;
  const _DetailRow({required this.icon, required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(children: [
      Icon(icon, size: 15, color: AppColors.text4),
      const SizedBox(width: 10),
      Text('$label: ', style: const TextStyle(color: AppColors.text4, fontSize: 13)),
      Expanded(child: Text(value, style: const TextStyle(color: AppColors.text1, fontSize: 13, fontWeight: FontWeight.w500))),
    ]));
}
