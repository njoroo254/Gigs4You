import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';
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

    final needsAcceptance = provider.tasks.where((t) => t.needsAcceptance).toList();
    // Show the acceptance banner on both 'all' and 'pending' tabs.
    // Only exclude needsAcceptance tasks from regular when the banner is visible
    // so they don't vanish silently on the pending tab.
    final showBanner = needsAcceptance.isNotEmpty &&
        (provider.statusFilter == 'all' || provider.statusFilter == 'pending');
    final regular = provider.filtered.where((t) => !showBanner || !t.needsAcceptance).toList();

    return Scaffold(
      backgroundColor: context.appSurfaceColor,
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: () => context.read<TasksProvider>().loadTasks(),
        child: CustomScrollView(slivers: [
          // ── App bar ──────────────────────────────
          SliverAppBar(
            pinned: true,
            backgroundColor: AppColors.dark,
            expandedHeight: 130,
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
                Text('No tasks assigned yet', style: TextStyle(color: context.appText3, fontSize: 15, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text('Pull to refresh', style: TextStyle(color: context.appText4, fontSize: 12)),
              ])),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
              sliver: SliverList(delegate: SliverChildListDelegate([

                if (showBanner) ...[
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

                if (regular.isEmpty && provider.tasks.isNotEmpty)
                  Center(child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text('No ${provider.statusFilter} tasks',
                      style: TextStyle(color: context.appText4, fontSize: 14)),
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
    final checklistComplete = task.hasChecklist && task.checklistDone == task.checklistTotal;

    return GestureDetector(
      onTap: () => _showDetail(context),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: context.appCardColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: showAcceptance ? const Color(0xFFFCD34D) :
                   task.isOverdue ? Colors.red.shade200 : context.appBorderColor,
            width: showAcceptance ? 1.5 : 0.5),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0,2))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(height: 3, decoration: BoxDecoration(
            color: priorityColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(14)))),

          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

              Row(children: [
                Expanded(child: Text(task.title,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  maxLines: 2, overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 8),
                _StatusBadge(task.status),
              ]),

              if (task.description != null && task.description!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(task.description!, style: TextStyle(color: context.appText3, fontSize: 12, height: 1.5),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
              ],

              // Requirement badges
              if (task.hasChecklist || task.requiresPhoto || task.requiresSignature) ...[
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 4, children: [
                  if (task.hasChecklist) _MicroBadge(
                    icon: checklistComplete ? Icons.check_circle : Icons.checklist,
                    label: '${task.checklistDone}/${task.checklistTotal}',
                    color: checklistComplete ? AppColors.primary : Colors.orange.shade700,
                    bg: checklistComplete ? AppColors.primaryPale : Colors.orange.shade50,
                  ),
                  if (task.requiresPhoto) _MicroBadge(
                    icon: task.photoUrls.isNotEmpty ? Icons.photo_library : Icons.camera_alt,
                    label: task.photoUrls.isNotEmpty ? '${task.photoUrls.length} photo${task.photoUrls.length > 1 ? 's' : ''}' : 'Photo req.',
                    color: task.photoUrls.isNotEmpty ? AppColors.primary : Colors.blue.shade700,
                    bg: task.photoUrls.isNotEmpty ? AppColors.primaryPale : Colors.blue.shade50,
                  ),
                  if (task.requiresSignature) _MicroBadge(
                    icon: Icons.draw,
                    label: 'Signature req.',
                    color: Colors.purple.shade700,
                    bg: Colors.purple.shade50,
                  ),
                ]),
              ],

              // Elapsed timer for active tasks
              if (task.isInProgress && task.startedAt != null) ...[
                const SizedBox(height: 8),
                _ElapsedTimer(startedAt: task.startedAt!),
              ],

              const SizedBox(height: 10),

              Row(children: [
                if (task.locationName != null) ...[
                  Icon(Icons.location_on, size: 12, color: context.appText4),
                  const SizedBox(width: 3),
                  Flexible(child: Text(task.locationName!, style: TextStyle(fontSize: 11, color: context.appText4), overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 10),
                ],
                if (task.dueAt != null) ...[
                  Icon(task.isOverdue ? Icons.warning_amber : Icons.access_time,
                    size: 12, color: task.isOverdue ? Colors.red : context.appText4),
                  const SizedBox(width: 3),
                  Text(_formatDate(task.dueAt!),
                    style: TextStyle(fontSize: 11, color: task.isOverdue ? Colors.red : context.appText4,
                      fontWeight: task.isOverdue ? FontWeight.w600 : FontWeight.normal)),
                ],
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: AppColors.primaryPale, borderRadius: BorderRadius.circular(99)),
                  child: Text('+${task.xpReward} XP',
                    style: const TextStyle(color: AppColors.primary, fontSize: 10, fontWeight: FontWeight.w700))),
              ]),

              // Accept/decline: always shown for tasks awaiting acceptance,
              // not just when there is an acceptance deadline
              if (showAcceptance) ...[
                const SizedBox(height: 10),
                _AcceptanceTimer(task: task, provider: provider),
              ],

              if (!showAcceptance && (task.isPending || task.isInProgress)) ...[
                const SizedBox(height: 12),
                Divider(height: 1, color: context.appBorderColor),
                const SizedBox(height: 10),
                Row(children: [
                  if (task.isPending && task.isAccepted)
                    Expanded(child: _ActionBtn(
                      label: 'Start', color: AppColors.info, icon: Icons.play_arrow,
                      onTap: () => _startTask(context))),
                  if (task.isInProgress) ...[
                    Expanded(child: _ActionBtn(
                      label: 'Complete', color: AppColors.primary, icon: Icons.check_circle,
                      onTap: () => _showDetail(context))),
                    const SizedBox(width: 8),
                    Expanded(child: _ActionBtn(
                      label: 'Fail', color: Colors.red, icon: Icons.cancel,
                      onTap: () => _failTask(context))),
                  ],
                  if (task.isPending && !task.isAccepted)
                    Expanded(child: _ActionBtn(
                      label: 'Accept first', color: AppColors.text4, icon: Icons.lock_clock,
                      onTap: () {})),
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

  Future<void> _startTask(BuildContext context) async {
    final ok = await provider.startTask(task.id);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok ? 'Task started!' : 'Failed: ${provider.error}'),
        backgroundColor: ok ? AppColors.primary : Colors.red));
    }
  }

  Future<void> _failTask(BuildContext context) async {
    final ctrl = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context, isScrollControlled: true, backgroundColor: context.appCardColor,
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
      context: context,
      isScrollControlled: true,
      backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _TaskDetailSheet(task: task, provider: provider),
    );
  }
}

// ── Task detail sheet ─────────────────────────────────
class _TaskDetailSheet extends StatefulWidget {
  final Task task;
  final TasksProvider provider;
  const _TaskDetailSheet({required this.task, required this.provider});
  @override State<_TaskDetailSheet> createState() => _TaskDetailSheetState();
}

class _TaskDetailSheetState extends State<_TaskDetailSheet> {
  late List<ChecklistItem> _checklist;
  bool _savingChecklist = false;
  final Map<String, bool> _itemUploading = {};

  // SharedPreferences key for this task's checklist draft
  String get _cacheKey => 'task_checklist_draft_${widget.task.id}';

  @override
  void initState() {
    super.initState();
    // Start with server state, then overlay any locally-cached draft
    _checklist = List<ChecklistItem>.from(widget.task.checklist);
    _loadDraft();
  }

  // ── Local persistence ──────────────────────────────
  /// Load locally-cached checklist progress (survives app close, offline use).
  /// The draft only exists when patches failed (offline). On successful sync the
  /// draft is cleared, so a stale draft from a previous session can never
  /// override a server-side checklist reset.
  Future<void> _loadDraft() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw == null || !mounted) return;
      final List<dynamic> decoded = jsonDecode(raw) as List<dynamic>;
      final cached = decoded
          .map((e) => ChecklistItem.fromJson(e as Map<String, dynamic>))
          .toList();

      // Stale-draft guard: if the server checklist has different item IDs the
      // task was reassigned / reset — discard the draft entirely.
      final serverIds = _checklist.map((i) => i.id).toSet();
      final draftIds  = cached.map((i) => i.id).toSet();
      if (serverIds.length != draftIds.length ||
          !serverIds.containsAll(draftIds)) {
        await _clearDraft();
        return;
      }

      // Merge: prefer draft only for items the server hasn't confirmed yet
      // (local checked=true, server checked=false → offline change).
      final merged = _checklist.map((serverItem) {
        final local = cached.firstWhere(
          (c) => c.id == serverItem.id,
          orElse: () => serverItem,
        );
        final morePhotos   = local.photoUrls.length > serverItem.photoUrls.length;
        final becameChecked = local.checked && !serverItem.checked;
        return (morePhotos || becameChecked) ? local : serverItem;
      }).toList();

      // If draft adds nothing over server state it is stale — clear it.
      final hasDiff = merged.any((m) {
        final s = _checklist.firstWhere((si) => si.id == m.id, orElse: () => m);
        return m.checked != s.checked || m.photoUrls.length != s.photoUrls.length;
      });
      if (!hasDiff) { await _clearDraft(); return; }

      if (mounted) setState(() => _checklist = merged);
    } catch (_) { /* corrupt cache — ignore, server data is fine */ }
  }

  /// Persist current checklist state locally (instant, works offline).
  Future<void> _saveDraft() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final json = jsonEncode(_checklist.map((i) => i.toJson()).toList());
      await prefs.setString(_cacheKey, json);
    } catch (_) {}
  }

  /// Clear the draft once the task is submitted (no need to persist anymore).
  Future<void> _clearDraft() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_cacheKey);
    } catch (_) {}
  }

  // ── Server sync ────────────────────────────────────
  /// Patch checklist to server and update the provider so the task list
  /// stays in sync without needing a full reload.
  Future<void> _patchAndSync() async {
    setState(() => _savingChecklist = true);
    try {
      final api = context.read<ApiClient>();
      final res = await api.patch(
        '/tasks/${widget.task.id}',
        {'checklist': _checklist.map((i) => i.toJson()).toList()},
      );
      // Update provider so reopening shows fresh data
      if (mounted) {
        context.read<TasksProvider>().updateTask(Task.fromJson(res));
      }
      // Server confirmed — draft is no longer needed; clear it so a stale
      // draft can never override a future server-side checklist reset.
      await _clearDraft();
    } catch (_) {
      // Network unavailable — save locally so progress survives app restarts.
      await _saveDraft();
    } finally {
      if (mounted) setState(() => _savingChecklist = false);
    }
  }

  // ── Checklist actions ──────────────────────────────

  /// Toggle a checklist item.  If the item requires photos, the agent must
  /// upload the required number BEFORE the item can be marked as done.
  Future<void> _toggleItem(int index) async {
    if (!widget.task.isInProgress) return;
    final item = _checklist[index];
    final tryingToCheck = !item.checked;

    // ── Photo prerequisite enforcement ──────────────
    if (tryingToCheck && item.requiresPhoto) {
      final have   = item.photoUrls.length;
      final needed = item.requiredPhotoCount;
      if (have < needed) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(
            'Upload $needed photo${needed > 1 ? 's' : ''} for this item before marking it done'
            '${have > 0 ? ' ($have/$needed uploaded)' : ''}'),
          backgroundColor: Colors.orange.shade700,
          behavior: SnackBarBehavior.floating));
        return;
      }
    }

    setState(() => _checklist[index] = item.copyWith(checked: tryingToCheck));
    // Sync to server; _patchAndSync saves draft only if the call fails (offline).
    await _patchAndSync();
  }

  Future<void> _uploadItemPhoto(int index) async {
    if (!widget.task.isInProgress) return;
    final item = _checklist[index];
    if (item.photoUrls.length >= 10) return;

    final picker = ImagePicker();
    final source = await showModalBottomSheet<ImageSource>(
      context: context, backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          leading: const Icon(Icons.camera_alt),
          title: const Text('Take photo'),
          onTap: () => Navigator.pop(ctx, ImageSource.camera)),
        ListTile(
          leading: const Icon(Icons.photo_library),
          title: const Text('Choose from gallery'),
          onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
      ])),
    );
    if (source == null || !mounted) return;

    // imageQuality 80 + maxWidth 1280 keeps typical photos under 2 MB
    final picked = await picker.pickImage(
      source: source, imageQuality: 80, maxWidth: 1280, maxHeight: 1280);
    if (picked == null || !mounted) return;

    setState(() => _itemUploading[item.id] = true);
    try {
      final api = context.read<ApiClient>();
      final url = await api.uploadTaskPhoto(picked.path, taskId: widget.task.id);
      if (url != null && mounted) {
        setState(() {
          _checklist[index] = item.copyWith(photoUrls: [...item.photoUrls, url]);
        });
        await _patchAndSync();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Upload failed — try again'),
          backgroundColor: Colors.red));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Upload failed — try again'),
          backgroundColor: Colors.red));
      }
    } finally {
      if (mounted) setState(() => _itemUploading.remove(item.id));
    }
  }

  Future<void> _removeItemPhoto(int itemIndex, int photoIndex) async {
    final item = _checklist[itemIndex];
    final newUrls = List<String>.from(item.photoUrls)..removeAt(photoIndex);
    setState(() => _checklist[itemIndex] = item.copyWith(photoUrls: newUrls));
    await _patchAndSync();
  }

  void _openComplete() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _CompleteTaskSheet(
        task: widget.task,
        provider: widget.provider,
        checklist: _checklist,
        onCompleted: () {
          Navigator.pop(context); // close complete sheet
          Navigator.pop(context); // close detail sheet
        },
        onClearDraft: _clearDraft,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final task = widget.task;
    final doneCount = _checklist.where((i) => i.checked).length;
    final totalCount = _checklist.length;
    final allRequired = !_checklist.any((i) => i.required && !i.checked);

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      expand: false,
      builder: (_, ctrl) => Column(children: [
        // Handle
        Center(child: Container(width: 36, height: 4, margin: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)))),
        Expanded(child: ListView(controller: ctrl, padding: const EdgeInsets.fromLTRB(20, 0, 20, 32), children: [

          // Title + status
          Row(children: [
            Expanded(child: Text(task.title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            const SizedBox(width: 8),
            _StatusBadge(task.status),
          ]),
          const SizedBox(height: 8),

          // Requirement badges
          if (task.requiresPhoto || task.requiresSignature || task.hasChecklist) ...[
            Wrap(spacing: 8, runSpacing: 4, children: [
              if (task.requiresPhoto) _SmallBadge(
                icon: Icons.camera_alt, label: 'Photo required', color: Colors.blue),
              if (task.requiresSignature) _SmallBadge(
                icon: Icons.draw, label: 'Signature required', color: Colors.purple),
              if (task.hasChecklist) _SmallBadge(
                icon: Icons.checklist,
                label: '$doneCount/$totalCount items',
                color: allRequired ? AppColors.primary : Colors.orange),
            ]),
            const SizedBox(height: 12),
          ],

          // Description
          if (task.description != null && task.description!.isNotEmpty) ...[
            Text(task.description!, style: TextStyle(color: context.appText2, fontSize: 14, height: 1.6)),
            const SizedBox(height: 16),
          ],

          // Detail rows
          if (task.locationName != null)
            _DetailRow(icon: Icons.location_on, label: 'Location', value: task.locationName!),
          if (task.dueAt != null)
            _DetailRow(icon: Icons.schedule, label: 'Due', value: _fmtDateTime(task.dueAt!)),
          if (task.startedAt != null) ...[
            _DetailRow(icon: Icons.play_arrow, label: 'Started', value: _fmtDateTime(task.startedAt!)),
            if (task.isInProgress)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _ElapsedTimer(startedAt: task.startedAt!)),
          ],
          _DetailRow(icon: Icons.star, label: 'XP reward', value: '+${task.xpReward} XP'),
          _DetailRow(icon: Icons.flag, label: 'Priority', value: task.priority.toUpperCase()),
          if (task.acceptanceStatus != null)
            _DetailRow(icon: Icons.how_to_reg, label: 'Acceptance', value: task.acceptanceStatus!),
          if (task.notes != null && task.notes!.isNotEmpty)
            _DetailRow(icon: Icons.notes, label: 'Notes', value: task.notes!),

          // Checklist section
          if (_checklist.isNotEmpty) ...[
            const SizedBox(height: 20),
            Row(children: [
              Icon(Icons.checklist, size: 16, color: context.appText3),
              const SizedBox(width: 8),
              const Text('Checklist', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const Spacer(),
              if (_savingChecklist)
                const SizedBox(width: 14, height: 14,
                  child: CircularProgressIndicator(strokeWidth: 1.5, color: AppColors.primary)),
              const SizedBox(width: 6),
              Text('$doneCount / $totalCount',
                style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: doneCount == totalCount ? AppColors.primary : context.appText4)),
            ]),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                border: Border.all(color: context.appBorderColor),
                borderRadius: BorderRadius.circular(12)),
              child: Column(children: [
                for (int i = 0; i < _checklist.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: context.appBorderColor),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    InkWell(
                      onTap: task.isInProgress ? () => _toggleItem(i) : null,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                        child: Row(children: [
                          Icon(
                            _checklist[i].checked ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                            color: _checklist[i].checked
                                ? AppColors.primary
                                : _checklist[i].required ? Colors.red.shade400 : Colors.grey.shade400,
                            size: 22),
                          const SizedBox(width: 12),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(_checklist[i].label,
                              style: TextStyle(
                                fontSize: 13,
                                color: _checklist[i].checked ? context.appText4 : context.appText1,
                                decoration: _checklist[i].checked ? TextDecoration.lineThrough : null)),
                            if (_checklist[i].requiresPhoto) ...[
                              const SizedBox(height: 2),
                              Text(
                                '📷 ${_checklist[i].photoUrls.length}/${_checklist[i].requiredPhotoCount} photo${_checklist[i].requiredPhotoCount > 1 ? 's' : ''}',
                                style: TextStyle(
                                  fontSize: 10, fontWeight: FontWeight.w600,
                                  color: _checklist[i].photoRequirementMet
                                      ? Colors.green.shade700 : Colors.blue.shade700)),
                            ],
                          ])),
                          // Camera button
                          if (_checklist[i].requiresPhoto && task.isInProgress) ...[
                            const SizedBox(width: 2),
                            _itemUploading[_checklist[i].id] == true
                                ? const SizedBox(width: 28, height: 28,
                                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                                : _checklist[i].photoUrls.length < 10
                                    ? IconButton(
                                        icon: Icon(Icons.add_a_photo,
                                          color: _checklist[i].photoRequirementMet
                                              ? AppColors.primary : Colors.blue.shade600,
                                          size: 20),
                                        padding: EdgeInsets.zero,
                                        constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                                        tooltip: 'Add photo',
                                        onPressed: () => _uploadItemPhoto(i))
                                    : Icon(Icons.check_circle, color: Colors.green.shade700, size: 20),
                          ],
                          if (_checklist[i].required && !_checklist[i].checked) ...[
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.red.shade50, borderRadius: BorderRadius.circular(99)),
                              child: const Text('required',
                                style: TextStyle(color: Colors.red, fontSize: 9, fontWeight: FontWeight.w700))),
                          ],
                        ]),
                      ),
                    ),
                    // Per-item photo strip
                    if (_checklist[i].photoUrls.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                        child: SizedBox(
                          height: 62,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: _checklist[i].photoUrls.length,
                            separatorBuilder: (_, __) => const SizedBox(width: 6),
                            itemBuilder: (_, p) => Stack(clipBehavior: Clip.none, children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(
                                  _checklist[i].photoUrls[p],
                                  width: 58, height: 58, fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    width: 58, height: 58, color: Colors.grey.shade100,
                                    child: const Icon(Icons.broken_image, size: 18, color: Colors.grey)))),
                              if (task.isInProgress)
                                Positioned(top: -4, right: -4, child: GestureDetector(
                                  onTap: () => _removeItemPhoto(i, p),
                                  child: Container(
                                    width: 18, height: 18,
                                    decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                                    child: const Icon(Icons.close, size: 11, color: Colors.white)))),
                            ]),
                          ),
                        ),
                      ),
                  ]),
                ],
              ]),
            ),
            if (!allRequired && task.isInProgress)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Row(children: [
                  const Icon(Icons.info_outline, size: 13, color: Colors.red),
                  const SizedBox(width: 4),
                  Text('Complete all required items before submitting',
                    style: TextStyle(fontSize: 11, color: Colors.red.shade700)),
                ])),
          ],

          // Existing photos
          if (task.photoUrls.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text('Photos', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 8),
            SizedBox(
              height: 90,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: task.photoUrls.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) => ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(task.photoUrls[i], width: 90, height: 90, fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      width: 90, height: 90, color: Colors.grey.shade100,
                      child: const Icon(Icons.broken_image, color: Colors.grey))),
                ),
              ),
            ),
          ],

          // Action buttons
          const SizedBox(height: 28),
          if (task.isInProgress) ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.check_circle_rounded, size: 18),
                label: const Text('Complete Task'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
                onPressed: _openComplete),
            ),
            const SizedBox(height: 10),
          ],
          if (task.isPending && task.isAccepted) ...[
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.play_arrow_rounded, size: 18),
                label: const Text('Start Task'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.info,
                  padding: const EdgeInsets.symmetric(vertical: 14)),
                onPressed: () async {
                  Navigator.pop(context);
                  await widget.provider.startTask(task.id);
                }),
            ),
          ],
        ])),
      ]),
    );
  }

  String _fmtDateTime(DateTime d) => '${d.day}/${d.month}/${d.year} ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
}

// ── Complete task sheet ───────────────────────────────
class _CompleteTaskSheet extends StatefulWidget {
  final Task task;
  final TasksProvider provider;
  final List<ChecklistItem> checklist;
  final VoidCallback onCompleted;
  final VoidCallback onClearDraft;
  const _CompleteTaskSheet({
    required this.task,
    required this.provider,
    required this.checklist,
    required this.onCompleted,
    required this.onClearDraft,
  });
  @override State<_CompleteTaskSheet> createState() => _CompleteTaskSheetState();
}

class _CompleteTaskSheetState extends State<_CompleteTaskSheet> {
  final _notesCtrl = TextEditingController();
  final List<String> _photoUrls = [];
  bool _uploading = false;
  bool _submitting = false;
  String? _uploadError;

  @override
  void dispose() { _notesCtrl.dispose(); super.dispose(); }

  bool get _canSubmit {
    if (widget.task.requiresPhoto && _photoUrls.isEmpty) return false;
    if (!widget.checklist.every((i) => !i.required || i.checked)) return false;
    // All photo-required checked items must have enough photos
    if (!widget.checklist.every((i) => !i.checked || i.photoRequirementMet)) return false;
    return !_uploading && !_submitting;
  }

  String get _submitBlockReason {
    if (widget.task.requiresPhoto && _photoUrls.isEmpty) return 'Add at least one photo';
    final unchecked = widget.checklist.where((i) => i.required && !i.checked).toList();
    if (unchecked.isNotEmpty) return 'Complete required checklist items';
    final missingPhotos = widget.checklist.where((i) => i.checked && !i.photoRequirementMet).toList();
    if (missingPhotos.isNotEmpty) {
      final item = missingPhotos.first;
      return 'Add ${item.requiredPhotoCount - item.photoUrls.length} more photo${item.requiredPhotoCount - item.photoUrls.length > 1 ? 's' : ''} for "${item.label}"';
    }
    return 'Submit completion';
  }

  Future<void> _pickAndUpload() async {
    final picker = ImagePicker();
    final source = await showModalBottomSheet<ImageSource>(
      context: context, backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          leading: const Icon(Icons.camera_alt),
          title: const Text('Take a photo'),
          onTap: () => Navigator.pop(ctx, ImageSource.camera)),
        ListTile(
          leading: const Icon(Icons.photo_library),
          title: const Text('Choose from gallery'),
          onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
      ])),
    );
    if (source == null) return;

    final picked = await picker.pickImage(source: source, imageQuality: 80, maxWidth: 1280);
    if (picked == null) return;

    setState(() { _uploading = true; _uploadError = null; });
    try {
      final api = context.read<ApiClient>();
      final url = await api.uploadTaskPhoto(picked.path, taskId: widget.task.id);
      if (url != null) {
        setState(() => _photoUrls.add(url));
      } else {
        setState(() => _uploadError = 'Upload failed — try again');
      }
    } catch (e) {
      setState(() => _uploadError = 'Upload failed: $e');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    // Include per-item photoUrls in checklistState so the server can validate them
    final checklistState = widget.checklist
        .map((i) => {
          'id': i.id,
          'checked': i.checked,
          if (i.photoUrls.isNotEmpty) 'photoUrls': i.photoUrls,
        })
        .toList();
    final ok = await widget.provider.completeTask(
      widget.task.id,
      notes: _notesCtrl.text.isEmpty ? null : _notesCtrl.text,
      photoUrls: _photoUrls.isEmpty ? null : _photoUrls,
      checklistState: checklistState,
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (ok) {
      widget.onClearDraft();
      widget.onCompleted();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('+${widget.task.xpReward} XP earned!'),
        backgroundColor: AppColors.primary));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(widget.provider.error ?? 'Failed to complete task'),
        backgroundColor: Colors.red));
    }
  }

  @override
  Widget build(BuildContext context) {
    final task = widget.task;
    final checklist = widget.checklist;
    final requiredUnchecked = checklist.where((i) => i.required && !i.checked).toList();

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start, children: [

        // Header
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Complete task', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(task.title, style: TextStyle(color: context.appText3, fontSize: 13),
              maxLines: 1, overflow: TextOverflow.ellipsis),
          ])),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.pop(context)),
        ]),
        const SizedBox(height: 16),

        // Checklist status
        if (checklist.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: requiredUnchecked.isEmpty ? Colors.green.shade50 : Colors.orange.shade50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: requiredUnchecked.isEmpty ? Colors.green.shade200 : Colors.orange.shade200)),
            child: Row(children: [
              Icon(
                requiredUnchecked.isEmpty ? Icons.check_circle : Icons.warning_amber_rounded,
                color: requiredUnchecked.isEmpty ? Colors.green : Colors.orange,
                size: 20),
              const SizedBox(width: 10),
              Expanded(child: requiredUnchecked.isEmpty
                ? Text('All ${checklist.length} checklist items done',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.green))
                : Text('${requiredUnchecked.length} required item${requiredUnchecked.length > 1 ? 's' : ''} unchecked:\n${requiredUnchecked.map((i) => '• ${i.label}').join('\n')}',
                    style: const TextStyle(fontSize: 12, color: Colors.orange, height: 1.5))),
            ]),
          ),
          const SizedBox(height: 14),
        ],

        // Photo upload
        if (task.requiresPhoto) ...[
          Row(children: [
            Icon(Icons.camera_alt, size: 15, color: context.appText4),
            const SizedBox(width: 6),
            Text('Photos ${task.requiresPhoto ? '(required)' : '(optional)'}',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(width: 6),
            if (_photoUrls.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: AppColors.primaryPale, borderRadius: BorderRadius.circular(99)),
                child: Text('${_photoUrls.length} added',
                  style: const TextStyle(color: AppColors.primary, fontSize: 11, fontWeight: FontWeight.w700))),
          ]),
          const SizedBox(height: 8),
          if (_photoUrls.isNotEmpty) ...[
            SizedBox(
              height: 80,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _photoUrls.length + 1,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  if (i == _photoUrls.length) {
                    return _AddPhotoBtn(uploading: _uploading, onTap: _pickAndUpload);
                  }
                  return Stack(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(_photoUrls[i], width: 80, height: 80, fit: BoxFit.cover)),
                    Positioned(top: 2, right: 2, child: GestureDetector(
                      onTap: () => setState(() => _photoUrls.removeAt(i)),
                      child: Container(
                        width: 20, height: 20,
                        decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                        child: const Icon(Icons.close, size: 12, color: Colors.white)))),
                  ]);
                },
              ),
            ),
          ] else ...[
            _AddPhotoBtn(uploading: _uploading, onTap: _pickAndUpload, fullWidth: true),
          ],
          if (_uploadError != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(_uploadError!, style: const TextStyle(color: Colors.red, fontSize: 12))),
          const SizedBox(height: 14),
        ],

        // Notes
        TextField(
          controller: _notesCtrl,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: 'Add notes (optional)...',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.all(12))),
        const SizedBox(height: 16),

        // Submit
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: _canSubmit ? AppColors.primary : Colors.grey.shade300,
              padding: const EdgeInsets.symmetric(vertical: 14)),
            onPressed: _canSubmit ? _submit : null,
            child: _submitting
                ? const SizedBox(height: 18, width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(
                    _submitBlockReason,
                    style: TextStyle(
                      color: _canSubmit ? Colors.white : Colors.grey.shade600,
                      fontWeight: FontWeight.w700)),
          ),
        ),
      ])),
    );
  }
}

// ── Add photo button ──────────────────────────────────
class _AddPhotoBtn extends StatelessWidget {
  final bool uploading;
  final VoidCallback onTap;
  final bool fullWidth;
  const _AddPhotoBtn({required this.uploading, required this.onTap, this.fullWidth = false});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: uploading ? null : onTap,
    child: Container(
      width: fullWidth ? double.infinity : 80,
      height: fullWidth ? 60 : 80,
      decoration: BoxDecoration(
        color: context.appSurfaceColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade300, width: 1.5,
          style: BorderStyle.solid)),
      child: uploading
          ? const Center(child: SizedBox(width: 24, height: 24,
              child: CircularProgressIndicator(strokeWidth: 2)))
          : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.add_a_photo, color: Colors.grey.shade500, size: fullWidth ? 22 : 26),
              if (fullWidth) ...[
                const SizedBox(height: 4),
                Text('Tap to add photo', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
              ],
            ]),
    ),
  );
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
      if (timeLeft != null) ...[
        Row(children: [
          Icon(isExpired ? Icons.alarm_off : Icons.alarm_rounded,
            size: 14, color: isExpired ? Colors.red : isExpiring ? Colors.orange : const Color(0xFFF59E0B)),
          const SizedBox(width: 6),
          Text(
            isExpired ? 'Acceptance deadline passed' : _formatDuration(timeLeft),
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
              color: isExpired ? Colors.red : isExpiring ? Colors.orange : const Color(0xFF92400E))),
        ]),
        const SizedBox(height: 8),
      ],
      Row(children: [
        Expanded(child: GestureDetector(
          onTap: () async {
            final ok = await provider.acceptTask(task.id);
            if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(ok ? 'Task accepted!' : 'Failed: ${provider.error}'),
              backgroundColor: ok ? AppColors.primary : Colors.red));
          },
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(8)),
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
              color: context.appCardColor, borderRadius: BorderRadius.circular(8),
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

// ── Elapsed timer widget ──────────────────────────────
class _ElapsedTimer extends StatelessWidget {
  final DateTime startedAt;
  const _ElapsedTimer({required this.startedAt});

  String _fmt(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60);
    if (h > 0) return '${h}h ${m.toString().padLeft(2,'0')}m';
    return '${m.toString().padLeft(2,'0')}:${s.toString().padLeft(2,'0')}';
  }

  @override
  Widget build(BuildContext context) {
    final elapsed = DateTime.now().difference(startedAt);
    final isLong  = elapsed.inHours >= 2;
    return Row(children: [
      Icon(Icons.timer_outlined, size: 12,
        color: isLong ? Colors.orange.shade700 : context.appText4),
      const SizedBox(width: 4),
      Text('Elapsed: ${_fmt(elapsed)}',
        style: TextStyle(
          fontSize: 11, fontWeight: FontWeight.w600,
          color: isLong ? Colors.orange.shade700 : context.appText4)),
    ]);
  }
}

// ── Shared widgets ────────────────────────────────────

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

class _MicroBadge extends StatelessWidget {
  final IconData icon; final String label; final Color color; final Color bg;
  const _MicroBadge({required this.icon, required this.label, required this.color, required this.bg});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 10, color: color),
      const SizedBox(width: 4),
      Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    ]));
}

class _SmallBadge extends StatelessWidget {
  final IconData icon; final String label; final Color color;
  const _SmallBadge({required this.icon, required this.label, required this.color});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(99),
      border: Border.all(color: color.withValues(alpha: 0.3))),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 12, color: color),
      const SizedBox(width: 5),
      Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
    ]));
}

class _ActionBtn extends StatelessWidget {
  final String label; final Color color; final IconData icon; final VoidCallback onTap;
  const _ActionBtn({required this.label, required this.color, required this.icon, required this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3))),
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
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(icon, size: 15, color: context.appText4),
      const SizedBox(width: 10),
      Text('$label: ', style: TextStyle(color: context.appText4, fontSize: 13)),
      Expanded(child: Text(value, style: TextStyle(color: context.appText1, fontSize: 13, fontWeight: FontWeight.w500))),
    ]));
}
