import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';
import '../jobs/jobs_provider.dart';
import '../jobs/jobs_tab.dart' show JobCard;

class ManagerJobsTab extends StatefulWidget {
  const ManagerJobsTab({super.key});
  @override State<ManagerJobsTab> createState() => _ManagerJobsTabState();
}

class _ManagerJobsTabState extends State<ManagerJobsTab>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String,dynamic>> _myPostings = [];
  bool _loadingPostings = true;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<JobsProvider>().loadJobs();
      _loadMyPostings();
    });
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _loadMyPostings() async {
    setState(() => _loadingPostings = true);
    try {
      final api  = context.read<ApiClient>();
      final data = await api.getJobsRaw(myPostings: true);
      final raw  = data['jobs'] as List? ?? (data is List ? data as List : []);
      setState(() => _myPostings = raw
          .whereType<Map<String, dynamic>>()
          .toList());
    } catch (_) { setState(() => _myPostings = []); }
    setState(() => _loadingPostings = false);
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<JobsProvider>();

    return Scaffold(
      backgroundColor: context.appSurfaceColor,
      appBar: AppBar(
        title: const Text('Jobs'),
        backgroundColor: AppColors.dark,
        actions: [
          Builder(builder: (ctx) {
            final isDark = ctx.watch<ThemeProvider>().isDark;
            return IconButton(
              padding: EdgeInsets.zero,
              iconSize: 18,
              tooltip: isDark ? 'Switch to light mode' : 'Switch to dark mode',
              icon: Icon(isDark ? Icons.wb_sunny_rounded : Icons.nightlight_round,
                color: Colors.white.withValues(alpha: 0.85), size: 18),
              onPressed: () => ctx.read<ThemeProvider>().toggle(),
            );
          }),
          const SizedBox(width: 4),
        ],
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: AppColors.primaryLight,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white38,
          labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          tabs: const [Tab(text: 'Marketplace'), Tab(text: 'My Postings')],
        ),
      ),
      body: TabBarView(controller: _tabs, children: [
        // ── Marketplace ──────────────────────────────
        _buildMarketplace(provider),
        // ── My Postings ──────────────────────────────
        _buildMyPostings(),
      ]),
    );
  }

  Widget _buildMarketplace(JobsProvider provider) {
    if (provider.loading) return const Center(child: CircularProgressIndicator());
    if (provider.jobs.isEmpty) return Center(
      child: Text('No jobs', style: TextStyle(color: context.appText4)));
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () => context.read<JobsProvider>().loadJobs(),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: provider.jobs.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) => JobCard(
          job: provider.jobs[i],
          onApply: () {}, // managers browse but don't apply
        ),
      ),
    );
  }

  Widget _buildMyPostings() {
    if (_loadingPostings) return const Center(child: CircularProgressIndicator());
    if (_myPostings.isEmpty) return Center(child: Column(
      mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.work_outline, size: 48, color: context.appText4),
        const SizedBox(height: 12),
        Text('No job postings yet', style: TextStyle(color: context.appText3, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          onPressed: () => _showPostDialog(),
          icon: const Icon(Icons.add, size: 16),
          label: const Text('Post a job'),
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary)),
      ]));

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _loadMyPostings,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _myPostings.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          if (i == 0) return Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: ElevatedButton.icon(
              onPressed: _showPostDialog,
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Post new job'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 12))));
          final job = _myPostings[i - 1];
          return _PostingCard(job: job, onRefresh: _loadMyPostings);
        },
      ),
    );
  }

  Future<void> _showPostDialog() async {
    final titleCtrl  = TextEditingController();
    final descCtrl   = TextEditingController();
    final locCtrl    = TextEditingController();
    final budgetCtrl = TextEditingController();
    String category  = 'sales';
    String budgetType = 'daily';

    await showModalBottomSheet(
      context: context, isScrollControlled: true, backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Post a job', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            _inp(titleCtrl, 'Job title *', Icons.title),
            const SizedBox(height: 10),
            _inp(descCtrl, 'Description', Icons.description, maxLines: 3),
            const SizedBox(height: 10),
            _inp(locCtrl, 'Location *', Icons.location_on),
            const SizedBox(height: 10),
            _inp(budgetCtrl, 'Budget (KES)', Icons.payments, type: TextInputType.number),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Category', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.appText3)),
                const SizedBox(height: 4),
                DropdownButtonFormField<String>(
                  initialValue: category, isDense: true,
                  decoration: InputDecoration(border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)), isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                  items: ['sales','technician','logistics','finance','research','merchandising','general']
                    .map((c) => DropdownMenuItem(value: c, child: Text(c, style: const TextStyle(fontSize: 13)))).toList(),
                  onChanged: (v) => setSt(() => category = v!)),
              ])),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Budget type', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.appText3)),
                const SizedBox(height: 4),
                DropdownButtonFormField<String>(
                  initialValue: budgetType, isDense: true,
                  decoration: InputDecoration(border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)), isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                  items: ['fixed','daily','hourly','monthly']
                    .map((t) => DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 13)))).toList(),
                  onChanged: (v) => setSt(() => budgetType = v!)),
              ])),
            ]),
            const SizedBox(height: 16),
            SizedBox(width: double.infinity, child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(vertical: 14)),
              onPressed: () async {
                if (titleCtrl.text.isEmpty || locCtrl.text.isEmpty) return;
                final api = ctx.read<ApiClient>();
                try {
                  await api.createJob({
                    'title': titleCtrl.text.trim(),
                    'description': descCtrl.text.trim(),
                    'location': locCtrl.text.trim(),
                    'budgetMin': double.tryParse(budgetCtrl.text) ?? 0,
                    'budgetMax': double.tryParse(budgetCtrl.text) ?? 0,
                    'budgetType': budgetType,
                    'category': category,
                  });
                  if (ctx.mounted) {
                    Navigator.pop(ctx);
                    _loadMyPostings();
                  }
                } catch (_) {}
              },
              child: const Text('Post job', style: TextStyle(fontWeight: FontWeight.w700)))),
          ])),
        ),
      ),
    );
  }

  Widget _inp(TextEditingController c, String hint, IconData icon,
      {int maxLines = 1, TextInputType type = TextInputType.text}) =>
    TextField(controller: c, maxLines: maxLines, keyboardType: type,
      style: const TextStyle(fontSize: 13),
      decoration: InputDecoration(
        hintText: hint, prefixIcon: Icon(icon, size: 18),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12)));
}

class _PostingCard extends StatelessWidget {
  final Map<String,dynamic> job;
  final VoidCallback onRefresh;
  const _PostingCard({required this.job, required this.onRefresh});
  @override
  Widget build(BuildContext context) {
    final status = job['status'] ?? 'open';
    final statusColor = status == 'open' ? AppColors.primary : status == 'assigned' ? Colors.blue : Colors.grey;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.appCardColor, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.appBorderColor, width: 0.5),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6)]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(job['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
          Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: statusColor.withOpacity(0.1), borderRadius: BorderRadius.circular(99)),
            child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor))),
        ]),
        if (job['location'] != null) ...[
          const SizedBox(height: 5),
          Row(children: [
            Icon(Icons.location_on, size: 12, color: context.appText4),
            const SizedBox(width: 3),
            Text(job['location'], style: TextStyle(fontSize: 12, color: context.appText4)),
          ]),
        ],
        const SizedBox(height: 8),
        Row(children: [
          Text('${job['applicantCount'] ?? 0} applicants', style: TextStyle(fontSize: 12, color: context.appText3)),
          const Spacer(),
          Text('KES ${job['budgetMin'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 13)),
        ]),
      ]),
    );
  }
}
