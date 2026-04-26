import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../shared/theme/app_theme.dart';

class ManagerTasksTab extends StatefulWidget {
  const ManagerTasksTab({super.key});
  @override State<ManagerTasksTab> createState() => _ManagerTasksTabState();
}

class _ManagerTasksTabState extends State<ManagerTasksTab>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Task>   _tasks    = [];
  List<dynamic> _agents  = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    final api = context.read<ApiClient>();
    final results = await Future.wait([
      api.getAllMyTasks().catchError((_) => []),
      api.getOrgAgents().catchError((_) => []),
    ]);
    setState(() {
      _tasks  = (results[0]).map((j) => Task.fromJson(j as Map<String,dynamic>)).toList();
      _agents = results[1];
      _loading = false;
    });
  }

  List<Task> _byStatus(String status) => _tasks.where((t) => t.status == status).toList();

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.surface,
    appBar: AppBar(
      backgroundColor: AppColors.dark, elevation: 0,
      title: const Text('Tasks', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
      actions: [
        IconButton(icon: const Icon(Icons.refresh, color: Colors.white70), onPressed: _load),
        IconButton(
          icon: const Icon(Icons.add_circle_outline, color: Colors.white),
          onPressed: () => _showCreateTask()),
      ],
      bottom: TabBar(
        controller: _tabs,
        indicatorColor: AppColors.primaryLight,
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white38,
        labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        tabs: [
          Tab(text: 'Active (${_byStatus('pending').length + _byStatus('in_progress').length})'),
          Tab(text: 'Done (${_byStatus('completed').length})'),
          Tab(text: 'All (${_tasks.length})'),
        ],
      ),
    ),
    body: _loading
      ? const Center(child: CircularProgressIndicator())
      : TabBarView(controller: _tabs, children: [
          _TaskList(_byStatus('pending') + _byStatus('in_progress'), onRefresh: _load, agents: _agents),
          _TaskList(_byStatus('completed'), onRefresh: _load, agents: _agents),
          _TaskList(_tasks, onRefresh: _load, agents: _agents),
        ]),
  );

  Future<void> _showCreateTask() async {
    final titleCtrl    = TextEditingController();
    final descCtrl     = TextEditingController();
    final locCtrl      = TextEditingController();
    String priority    = 'medium';
    String? agentId;

    await showModalBottomSheet(
      context: context, isScrollControlled: true, backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Create task', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            _field(titleCtrl, 'Task title *', Icons.title),
            const SizedBox(height: 10),
            _field(descCtrl, 'Description', Icons.notes, maxLines: 3),
            const SizedBox(height: 10),
            _field(locCtrl, 'Location', Icons.location_on),
            const SizedBox(height: 10),

            // Priority
            const Text('Priority', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.text3)),
            const SizedBox(height: 6),
            Row(children: [
              for (final p in [('low','Low',Colors.green),('medium','Medium',Colors.orange),('high','High',Colors.red)])
                Expanded(child: GestureDetector(
                  onTap: () => setSt(() => priority = p.$1),
                  child: Container(
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: priority == p.$1 ? p.$3.withOpacity(0.1) : AppColors.surface,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: priority == p.$1 ? p.$3 : AppColors.border)),
                    child: Center(child: Text(p.$2,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                        color: priority == p.$1 ? p.$3 : AppColors.text4)))))),
            ]),
            const SizedBox(height: 10),

            // Assign to agent
            const Text('Assign to agent', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.text3)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: agentId, hint: const Text('Select agent', style: TextStyle(fontSize: 13)),
              decoration: InputDecoration(border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
              items: _agents.map((a) {
                final agent = a is Map ? a : {};
                final name  = agent['user']?['name'] ?? agent['name'] ?? 'Agent';
                final id    = agent['id']?.toString() ?? '';
                return DropdownMenuItem(value: id, child: Text(name, style: const TextStyle(fontSize: 13)));
              }).toList(),
              onChanged: (v) => setSt(() => agentId = v)),
            const SizedBox(height: 16),

            SizedBox(width: double.infinity, child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 14)),
              onPressed: () async {
                if (titleCtrl.text.trim().isEmpty) return;
                final api = ctx.read<ApiClient>();
                try {
                  await api.createTask({
                    'title':       titleCtrl.text.trim(),
                    'description': descCtrl.text.trim(),
                    'locationName': locCtrl.text.trim(),
                    'priority':    priority,
                    if (agentId != null && agentId!.isNotEmpty) 'agentId': agentId,
                  });
                  if (ctx.mounted) { Navigator.pop(ctx); _load(); }
                } catch (e) {
                  ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red));
                }
              },
              child: const Text('Create task', style: TextStyle(fontWeight: FontWeight.w700)))),
          ])),
        ),
      ),
    );
  }

  Widget _field(TextEditingController ctrl, String hint, IconData icon, {int maxLines = 1}) =>
    TextField(controller: ctrl, maxLines: maxLines,
      style: const TextStyle(fontSize: 13),
      decoration: InputDecoration(
        hintText: hint, prefixIcon: Icon(icon, size: 18, color: AppColors.text4),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12)));
}

class _TaskList extends StatelessWidget {
  final List<Task> tasks;
  final VoidCallback onRefresh;
  final List<dynamic> agents;
  const _TaskList(this.tasks, {required this.onRefresh, required this.agents});

  @override
  Widget build(BuildContext context) {
    if (tasks.isEmpty) return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      const Icon(Icons.assignment_outlined, size: 56, color: AppColors.text4),
      const SizedBox(height: 12),
      const Text('No tasks here', style: TextStyle(color: AppColors.text3, fontWeight: FontWeight.w600, fontSize: 15)),
    ]));

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async => onRefresh(),
      child: ListView.separated(
        padding: const EdgeInsets.all(14),
        itemCount: tasks.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => _ManagerTaskCard(task: tasks[i]),
      ),
    );
  }
}

class _ManagerTaskCard extends StatelessWidget {
  final Task task;
  const _ManagerTaskCard({required this.task});

  Color get _priorityColor => task.priority == 'high' ? Colors.red
    : task.priority == 'medium' ? Colors.orange : Colors.green;

  Color get _statusColor => task.isCompleted ? AppColors.primary
    : task.isInProgress ? AppColors.info : task.isFailed ? Colors.red : AppColors.text4;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Colors.white, borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppColors.border, width: 0.5),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6)]),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Container(width: 10, height: 10, margin: const EdgeInsets.only(right: 8),
          decoration: BoxDecoration(color: _priorityColor, shape: BoxShape.circle)),
        Expanded(child: Text(task.title,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
          maxLines: 2, overflow: TextOverflow.ellipsis)),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: _statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(99)),
          child: Text(task.statusDisplay,
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _statusColor))),
      ]),
      if (task.locationName != null && task.locationName!.isNotEmpty) ...[
        const SizedBox(height: 6),
        Row(children: [
          const Icon(Icons.location_on_outlined, size: 12, color: AppColors.text4),
          const SizedBox(width: 3),
          Text(task.locationName!, style: const TextStyle(fontSize: 12, color: AppColors.text4)),
        ]),
      ],
      if (task.dueAt != null) ...[
        const SizedBox(height: 4),
        Row(children: [
          const Icon(Icons.schedule, size: 12, color: AppColors.text4),
          const SizedBox(width: 3),
          Text('Due ${_formatDate(task.dueAt!)}',
            style: TextStyle(fontSize: 12, color: task.isOverdue ? Colors.red : AppColors.text4)),
          if (task.isOverdue) ...[
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(color: Colors.red.withOpacity(0.1), borderRadius: BorderRadius.circular(99)),
              child: const Text('OVERDUE', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Colors.red))),
          ],
        ]),
      ],
      if (task.needsAcceptance) ...[
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(8)),
          child: Row(children: [
            const Icon(Icons.access_time, size: 14, color: Color(0xFFD97706)),
            const SizedBox(width: 6),
            Text('Awaiting agent acceptance', style: const TextStyle(fontSize: 11, color: Color(0xFF92400E), fontWeight: FontWeight.w600)),
          ])),
      ],
    ]),
  );

  String _formatDate(DateTime d) =>
    '${d.day}/${d.month}/${d.year} ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}';
}
