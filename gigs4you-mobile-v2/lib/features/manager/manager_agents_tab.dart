import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/theme_provider.dart';

class ManagerAgentsTab extends StatefulWidget {
  const ManagerAgentsTab({super.key});
  @override State<ManagerAgentsTab> createState() => _ManagerAgentsTabState();
}

class _ManagerAgentsTabState extends State<ManagerAgentsTab> {
  List<Agent> _agents     = [];
  Agent?      _selected;
  bool        _loading    = true;
  String      _filter     = 'all'; // all | in_field | offline

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final api  = context.read<ApiClient>();
      final data = await api.getOrgAgents();
      setState(() => _agents = data.map((j) => Agent.fromJson(j as Map<String,dynamic>)).toList());
    } catch (_) { setState(() => _agents = []); }
    setState(() => _loading = false);
  }

  List<Agent> get _filtered {
    if (_filter == 'in_field') return _agents.where((a) => a.isCheckedIn).toList();
    if (_filter == 'offline')  return _agents.where((a) => !a.isCheckedIn).toList();
    return _agents;
  }

  @override
  Widget build(BuildContext context) {
    final inField = _agents.where((a) => a.isCheckedIn).length;
    return Scaffold(
      backgroundColor: context.appSurfaceColor,
      body: _selected != null ? _agentDetail() : _agentList(inField),
    );
  }

  Widget _agentList(int inField) => CustomScrollView(slivers: [
    SliverAppBar(
      pinned: true, floating: true, snap: true,
      backgroundColor: AppColors.dark, expandedHeight: 120,
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
      flexibleSpace: FlexibleSpaceBar(
        background: Container(
          color: AppColors.dark,
          padding: const EdgeInsets.fromLTRB(20, 56, 20, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Agents', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Row(children: [
              _pill('$inField in field', AppColors.primary),
              const SizedBox(width: 8),
              _pill('${_agents.length - inField} offline', context.appText4),
            ]),
          ]),
        ),
      ),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(48),
        child: Container(
          color: AppColors.dark,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final f in [('all','All'), ('in_field','In field'), ('offline','Offline')])
                GestureDetector(
                  onTap: () => setState(() => _filter = f.$1),
                  child: Container(
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: _filter == f.$1 ? AppColors.primary : Colors.white.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(99)),
                    child: Text(f.$2, style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600,
                      color: _filter == f.$1 ? Colors.white : Colors.white60))),
                ),
            ]),
          ),
        ),
      ),
    ),
    if (_loading)
      const SliverFillRemaining(child: Center(child: CircularProgressIndicator()))
    else if (_filtered.isEmpty)
      SliverFillRemaining(child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.people_outline, size: 56, color: context.appText4),
        const SizedBox(height: 12),
        Text(_filter == 'in_field' ? 'No agents in the field right now' : 'No agents found',
          style: TextStyle(color: context.appText3, fontSize: 15, fontWeight: FontWeight.w600)),
      ])))
    else
      SliverPadding(
        padding: const EdgeInsets.all(16),
        sliver: SliverList(delegate: SliverChildBuilderDelegate((_, i) {
          final agent = _filtered[i];
          return _AgentCard(
            agent: agent,
            onTap: () => setState(() => _selected = agent),
          );
        }, childCount: _filtered.length)),
      ),
  ]);

  Widget _agentDetail() {
    final a = _selected!;
    return Scaffold(
      backgroundColor: context.appSurfaceColor,
      appBar: AppBar(
        backgroundColor: AppColors.dark,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => setState(() => _selected = null)),
        title: Text(a.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        actions: [
          if (a.isCheckedIn)
            Container(
              margin: const EdgeInsets.only(right: 16),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(99)),
              child: const Text('● IN FIELD', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800))),
        ],
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        // Profile card
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: context.appCardColor, borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.appBorderColor, width: 0.5)),
          child: Row(children: [
            CircleAvatar(radius: 30, backgroundColor: AppColors.primary,
              child: Text(a.initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18))),
            const SizedBox(width: 16),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(a.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              Text(a.user?.phone ?? '', style: TextStyle(color: context.appText4, fontSize: 12)),
              const SizedBox(height: 6),
              Row(children: [
                _infoPill('Lv ${a.level}', AppColors.primary),
                const SizedBox(width: 6),
                _infoPill('${a.totalXp} XP', context.appText3),
                const SizedBox(width: 6),
                _infoPill('🔥 ${a.currentStreak}', Colors.orange),
              ]),
            ])),
          ]),
        ),
        const SizedBox(height: 12),

        // Stats row
        Row(children: [
          Expanded(child: _statBox('Jobs done', '${a.completedJobs}', AppColors.primary)),
          const SizedBox(width: 10),
          Expanded(child: _statBox('Rating', a.rating != null ? '⭐ ${a.rating!.toStringAsFixed(1)}' : '—', AppColors.warning)),
          const SizedBox(width: 10),
          Expanded(child: _statBox('Status', a.isCheckedIn ? 'In field' : 'Offline',
            a.isCheckedIn ? AppColors.primary : context.appText4)),
        ]),
        const SizedBox(height: 12),

        // XP progress
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: context.appCardColor, borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.appBorderColor, width: 0.5)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('Level ${a.level} — ${a.levelTitle}',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              Text('${a.totalXp} XP', style: const TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: a.levelProgress, minHeight: 6,
                backgroundColor: context.appBorderColor,
                valueColor: const AlwaysStoppedAnimation(AppColors.primary))),
            const SizedBox(height: 4),
            Text('${a.xpForNextLevel - a.totalXp} XP to next level',
              style: TextStyle(fontSize: 11, color: context.appText4)),
          ]),
        ),
        const SizedBox(height: 12),

        // Skills
        if (a.skills.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: context.appCardColor, borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.appBorderColor, width: 0.5)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Skills', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(height: 10),
              Wrap(spacing: 6, runSpacing: 6, children: a.skills.map((s) =>
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: context.appSurfaceColor, borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: context.appBorderColor)),
                  child: Text(s.name, style: TextStyle(fontSize: 11, color: context.appText2)))).toList()),
            ]),
          ),
          const SizedBox(height: 12),
        ],

        // Location info
        if (a.lastLatitude != null)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.primaryPale, borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.primary.withOpacity(0.2))),
            child: Row(children: [
              const Icon(Icons.location_on_rounded, color: AppColors.primary, size: 20),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Last known position', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.primary)),
                Text('${a.lastLatitude!.toStringAsFixed(4)}, ${a.lastLongitude!.toStringAsFixed(4)}',
                  style: TextStyle(fontSize: 11, color: context.appText3, fontFamily: 'monospace')),
              ])),
            ]),
          ),
      ]),
    );
  }

  Widget _pill(String text, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
    decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(99)),
    child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)));

  Widget _infoPill(String text, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(99)),
    child: Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)));

  Widget _statBox(String label, String value, Color color) => Container(
    padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
    decoration: BoxDecoration(color: context.appCardColor, borderRadius: BorderRadius.circular(12),
      border: Border.all(color: context.appBorderColor, width: 0.5)),
    child: Column(children: [
      Text(value, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: color)),
      const SizedBox(height: 3),
      Text(label, style: TextStyle(fontSize: 10, color: context.appText4, fontWeight: FontWeight.w500)),
    ]));
}

class _AgentCard extends StatelessWidget {
  final Agent agent;
  final VoidCallback onTap;
  const _AgentCard({required this.agent, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.appCardColor, borderRadius: BorderRadius.circular(14),
        border: Border.all(color: agent.isCheckedIn ? AppColors.primary.withOpacity(0.3) : context.appBorderColor, width: 0.5),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 6)]),
      child: Row(children: [
        Stack(children: [
          CircleAvatar(radius: 22, backgroundColor: agent.isCheckedIn ? AppColors.primary : context.appSurfaceColor,
            child: Text(agent.initials, style: TextStyle(
              color: agent.isCheckedIn ? Colors.white : context.appText3,
              fontWeight: FontWeight.w800, fontSize: 15))),
          if (agent.isCheckedIn)
            Positioned(right: 0, bottom: 0, child: Container(
              width: 12, height: 12,
              decoration: BoxDecoration(color: AppColors.success, shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2)))),
        ]),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(agent.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: agent.isCheckedIn ? AppColors.primary.withOpacity(0.1) : context.appSurfaceColor,
                borderRadius: BorderRadius.circular(99)),
              child: Text(agent.isCheckedIn ? 'In field' : 'Offline',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                  color: agent.isCheckedIn ? AppColors.primary : context.appText4))),
          ]),
          const SizedBox(height: 3),
          Row(children: [
            Text('Lv ${agent.level} · ${agent.completedJobs} jobs',
              style: TextStyle(fontSize: 12, color: context.appText4)),
            if (agent.currentStreak > 0) ...[
              const SizedBox(width: 8),
              Text('🔥${agent.currentStreak}', style: const TextStyle(fontSize: 12)),
            ],
          ]),
          if (agent.skills.isNotEmpty) ...[
            const SizedBox(height: 6),
            Wrap(spacing: 4, children: agent.skills.take(3).map((s) =>
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: context.appSurfaceColor, borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: context.appBorderColor)),
                child: Text(s.name, style: TextStyle(fontSize: 9, color: context.appText3)))).toList()),
          ],
        ])),
        Icon(Icons.chevron_right, color: context.appText4, size: 18),
      ]),
    ),
  );
}
