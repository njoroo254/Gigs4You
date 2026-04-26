import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/models/models.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';
import 'jobs_provider.dart';

const _catColors = {
  'sales': Color(0xFF3B82F6), 'technician': Color(0xFFF97316),
  'logistics': Color(0xFF0D9488), 'finance': Color(0xFF8B5CF6),
  'research': Color(0xFFEC4899), 'merchandising': Color(0xFF1B6B3A),
  'general': Color(0xFF6B7280),
};

class JobsTab extends StatefulWidget {
  const JobsTab({super.key});
  @override State<JobsTab> createState() => _JobsTabState();
}

class _JobsTabState extends State<JobsTab> {
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<JobsProvider>().loadJobs();
    });
  }

  @override
  void dispose() { _searchCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<JobsProvider>();

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: NestedScrollView(
        headerSliverBuilder: (_, __) => [
          SliverAppBar(
            pinned: true, floating: true, snap: true,
            backgroundColor: AppColors.dark, expandedHeight: 130,
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
                  const Text('Jobs', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text('${provider.jobs.length} listings available',
                    style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 12)),
                ]),
              ),
            ),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(50),
              child: Container(
                color: AppColors.dark,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                child: TextField(
                  controller: _searchCtrl,
                  onChanged: provider.setSearch,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: InputDecoration(
                    hintText: 'Search jobs by skill or title...',
                    hintStyle: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 13),
                    prefixIcon: const Icon(Icons.search, color: Colors.white54, size: 18),
                    filled: true, fillColor: Colors.white.withOpacity(0.08),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: BorderSide.none),
                    contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                    isDense: true),
                ),
              ),
            ),
          ),
        ],
        body: Column(children: [
          // Category chips
          Container(
            color: context.appCardColor,
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(children: [
                ...provider.categories.map((cat) {
                  final active = provider.selectedCategory == cat['id'];
                  final color  = _catColors[cat['id']] ?? AppColors.primary;
                  return GestureDetector(
                    onTap: () => provider.setCategory(cat['id']!),
                    child: Container(
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: active ? color : context.appCardColor,
                        borderRadius: BorderRadius.circular(99),
                        border: Border.all(color: active ? color : context.appBorderColor)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text(cat['icon']!, style: const TextStyle(fontSize: 13)),
                        const SizedBox(width: 5),
                        Text(cat['label']!,
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                            color: active ? Colors.white : context.appText2)),
                      ]),
                    ),
                  );
                }),
              ]),
            ),
          ),

          // Job cards
          Expanded(child: provider.loading
            ? const Center(child: CircularProgressIndicator())
            : provider.jobs.isEmpty
              ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.work_off_outlined, size: 48, color: context.appText4),
                  const SizedBox(height: 12),
                  Text('No jobs found', style: TextStyle(color: context.appText3, fontSize: 15, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text('Try a different category or search', style: TextStyle(color: context.appText4, fontSize: 12)),
                ]))
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: () => provider.loadJobs(),
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
                    itemCount: provider.jobs.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => JobCard(
                      job: provider.jobs[i],
                      onApply: () => _applyFlow(context, provider, provider.jobs[i]),
                    ),
                  ),
                ),
          ),
        ]),
      ),
    );
  }

  Future<void> _applyFlow(BuildContext context, JobsProvider provider, Job job) async {
    final noteCtrl = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context, isScrollControlled: true, backgroundColor: context.appCardColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Apply — ${job.title}',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          Text(job.postedByName ?? '', style: const TextStyle(color: AppColors.text4, fontSize: 12)),
          const SizedBox(height: 16),
          const Text('Cover note (optional)', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.text3)),
          const SizedBox(height: 6),
          TextField(controller: noteCtrl, maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Why are you a good fit for this role?',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              contentPadding: const EdgeInsets.all(12))),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel'))),
            const SizedBox(width: 12),
            Expanded(child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Submit application'))),
          ]),
        ]),
      ),
    );
    if (confirmed == true && context.mounted) {
      final ok = await provider.applyForJob(job.id, coverNote: noteCtrl.text.isEmpty ? null : noteCtrl.text);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(ok ? '✅ Application submitted!' : 'Failed: ${provider.error}'),
          backgroundColor: ok ? AppColors.primary : Colors.red));
      }
    }
  }
}

class JobCard extends StatelessWidget {
  final Job job;
  final VoidCallback onApply;
  const JobCard({required this.job, required this.onApply});

  @override
  Widget build(BuildContext context) {
    final catColor = _catColors[job.category] ?? AppColors.primary;
    final daysAgo  = DateTime.now().difference(job.postedAt).inDays;

    return Container(
      decoration: BoxDecoration(
        color: context.appCardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.appBorderColor, width: 0.5),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0,2))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Category colour bar
        Container(height: 4, decoration: BoxDecoration(
          color: catColor, borderRadius: const BorderRadius.vertical(top: Radius.circular(16)))),

        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

            // Top row: title + category chip
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (job.isUrgent)
                  Container(margin: const EdgeInsets.only(bottom: 5),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(99)),
                    child: const Text('⚡ URGENT', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Color(0xFF92400E)))),
                Text(job.title,
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: context.appText1),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Text(job.postedByName ?? '', style: TextStyle(fontSize: 12, color: context.appText4)),
              ])),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: catColor.withOpacity(0.1), borderRadius: BorderRadius.circular(99)),
                child: Text(job.category,
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: catColor)),
              ),
            ]),

            const SizedBox(height: 12),

            // Budget
            Text('${job.budgetDisplay} / ${job.budgetType}',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.primary)),

            const SizedBox(height: 10),

            // Skills
            if (job.requiredSkills.isNotEmpty)
              Wrap(spacing: 5, runSpacing: 5, children: [
                ...job.requiredSkills.take(4).map((s) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(
                    color: context.appSurfaceColor, borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: context.appBorderColor, width: 0.5)),
                  child: Text(s, style: TextStyle(fontSize: 10, color: context.appText2)))),
                if (job.requiredSkills.length > 4)
                  Text('+${job.requiredSkills.length-4}', style: TextStyle(fontSize: 11, color: context.appText4)),
              ]),

            const SizedBox(height: 12),

            // Footer row
            Row(children: [
              Icon(Icons.location_on, size: 13, color: context.appText4),
              const SizedBox(width: 3),
              Expanded(child: Text(job.location,
                style: TextStyle(fontSize: 11, color: context.appText4),
                overflow: TextOverflow.ellipsis)),
              Text('${job.applicants} applied',
                style: TextStyle(fontSize: 11, color: context.appText4)),
              const SizedBox(width: 10),
              Text(daysAgo == 0 ? 'Today' : '${daysAgo}d ago',
                style: TextStyle(fontSize: 11, color: context.appText4)),
            ]),

            const SizedBox(height: 12),

            // Apply button
            SizedBox(width: double.infinity,
              child: ElevatedButton(
                onPressed: job.status == 'open' ? onApply : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: job.status=='open' ? AppColors.primary : AppColors.border,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                child: Text(
                  job.status=='open' ? 'Apply now' : job.status=='assigned' ? 'Position filled' : job.status,
                  style: TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 13,
                    color: job.status=='open' ? Colors.white : context.appText4)),
              )),
          ]),
        ),
      ]),
    );
  }
}
