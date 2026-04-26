import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../auth/auth_provider.dart';
import 'profile_provider.dart';

class ProfileTab extends StatefulWidget {
  const ProfileTab({super.key});
  @override State<ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<ProfileTab> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<dynamic> _allSkills     = [];
  List<String>  _mySkillIds    = [];
  bool          _loadingSkills = true;
  bool          _saving        = false;
  bool          _addingOther   = false;
  String?       _avatarUrl;
  final _otherSkillCtrl = TextEditingController();

  final _bioCtrl       = TextEditingController();
  final _locationCtrl  = TextEditingController();
  final _dailyCtrl     = TextEditingController();
  final _hourlyCtrl    = TextEditingController();
  final _mpesaCtrl     = TextEditingController();
  bool  _isAvailable   = true;
  String _skillSearch  = '';
  String _skillCat     = 'all';

  static const _catColors = {
    'sales':'#3B82F6', 'technician':'#F97316', 'logistics':'#0D9488',
    'finance':'#8B5CF6', 'research':'#EC4899', 'merchandising':'#1B6B3A', 'general':'#6B7280',
  };

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _bioCtrl.dispose(); _locationCtrl.dispose();
    _dailyCtrl.dispose(); _hourlyCtrl.dispose(); _mpesaCtrl.dispose();
    _otherSkillCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    final api = context.read<ApiClient>();
    setState(() => _loadingSkills = true);
    try {
      final results = await Future.wait<dynamic>([
        api.getSkills(),
        api.getMyProfile(),
      ]);
      _allSkills = (results[0] as List?) ?? [];
      final profile = results[1];
      if (profile != null) {
        final wp = await api.getWorkerProfile().catchError((_) => null);
        if (wp != null && mounted) {
          _mySkillIds = (wp['skills'] as List? ?? []).map((s) => s['id'].toString()).toList();
          _bioCtrl.text      = wp['bio'] ?? '';
          _locationCtrl.text = wp['location'] ?? '';
          _dailyCtrl.text    = wp['dailyRate']?.toString() ?? '';
          _hourlyCtrl.text   = wp['hourlyRate']?.toString() ?? '';
          _mpesaCtrl.text    = wp['mpesaPhone'] ?? '';
          _isAvailable       = wp['isAvailable'] ?? true;
          if (wp['avatarUrl'] != null) _avatarUrl = wp['avatarUrl'] as String?;
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingSkills = false);
  }

  Future<void> _saveProfile() async {
    setState(() => _saving = true);
    final api = context.read<ApiClient>();
    try {
      await api.updateWorkerProfile({
        'bio':              _bioCtrl.text.trim(),
        'location':         _locationCtrl.text.trim(),
        'dailyRate':        double.tryParse(_dailyCtrl.text),
        'hourlyRate':       double.tryParse(_hourlyCtrl.text),
        'mpesaPhone':       _mpesaCtrl.text.trim(),
        'isAvailable':      _isAvailable,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Profile saved!'), backgroundColor: AppColors.primary));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Failed to save'), backgroundColor: Colors.red));
      }
    }
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _pickAndUploadAvatar() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, maxWidth: 512, imageQuality: 80);
    if (picked == null || !mounted) return;

    final api = context.read<ApiClient>();
    try {
      // Upload file bytes to MinIO via API, get back URL
      final bytes = await picked.readAsBytes();
      final filename = 'avatar_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final formData = FormData.fromMap({'file': MultipartFile.fromBytes(bytes, filename: filename)});
      final res = await api.uploadAvatar(formData);
      final url = res['url'] ?? res['avatarUrl'];
      if (url != null && mounted) {
        setState(() => _avatarUrl = url);
        await api.updateWorkerProfile({'avatarUrl': url});
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('Profile photo updated!'),
          backgroundColor: AppColors.primary));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Upload failed: $e'),
        backgroundColor: Colors.red));
    }
  }

  Future<void> _saveSkills() async {
    setState(() => _saving = true);
    final api = context.read<ApiClient>();
    try {
      await api.updateSkills(_mySkillIds);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('${_mySkillIds.length} skills saved!'),
          backgroundColor: AppColors.primary));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Failed to save skills'), backgroundColor: Colors.red));
      }
    }
    if (mounted) setState(() => _saving = false);
  }

  Color _catColor(String? cat) {
    final hex = _catColors[cat] ?? '#1B6B3A';
    return Color(int.parse('FF${hex.substring(1)}', radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<ProfileProvider>();
    final agent   = profile.agent;
    final auth    = context.read<AuthProvider>();

    final completionItems = [
      _bioCtrl.text.isNotEmpty && _locationCtrl.text.isNotEmpty,
      _mySkillIds.isNotEmpty,
      _dailyCtrl.text.isNotEmpty || _hourlyCtrl.text.isNotEmpty,
      _mpesaCtrl.text.isNotEmpty,
    ];
    final pct = (completionItems.where((b) => b).length / completionItems.length * 100).round();

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: NestedScrollView(
        headerSliverBuilder: (ctx, _) => [
          SliverAppBar(
            pinned: true, expandedHeight: 180,
            backgroundColor: AppColors.dark,
            actions: [
              IconButton(
                icon: const Icon(Icons.logout_rounded, color: Colors.white70, size: 20),
                onPressed: () => auth.logout(context),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                color: AppColors.dark,
                padding: const EdgeInsets.fromLTRB(20, 60, 20, 16),
                child: Column(children: [
                  Row(children: [
                    CircleAvatar(radius: 28,
                      backgroundColor: AppColors.primary,
                      child: Text(agent?.initials ?? 'A',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18))),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(agent?.name ?? 'Agent',
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                      Text(agent?.user?.roleDisplay ?? 'Field Agent',
                        style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 12)),
                      const SizedBox(height: 6),
                      Row(children: [
                        _Pill('⭐ Lv ${agent?.level ?? 1}'),
                        const SizedBox(width: 6),
                        _Pill('🔥 ${agent?.currentStreak ?? 0} streak'),
                        const SizedBox(width: 6),
                        _Pill('${agent?.totalXp ?? 0} XP'),
                      ]),
                    ])),
                  ]),
                  const SizedBox(height: 12),
                  // Completion bar
                  Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Text('Profile $pct% complete',
                          style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 11)),
                        Text(pct == 100 ? 'Complete!' : '${completionItems.where((b) => b).length}/4 steps',
                          style: TextStyle(color: pct == 100 ? AppColors.primaryLight : AppColors.warning, fontSize: 11, fontWeight: FontWeight.w600)),
                      ]),
                      const SizedBox(height: 4),
                      ClipRRect(borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: pct / 100,
                          backgroundColor: Colors.white.withOpacity(0.15),
                          valueColor: AlwaysStoppedAnimation(
                            pct == 100 ? AppColors.primaryLight : AppColors.warning),
                          minHeight: 5)),
                    ])),
                  ]),
                ]),
              ),
            ),
            bottom: TabBar(
              controller: _tabs,
              indicatorColor: AppColors.primaryLight,
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white38,
              labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              tabs: [
                const Tab(text: 'Bio & Location'),
                Tab(text: 'Skills (${_mySkillIds.length})'),
                const Tab(text: 'Rates'),
              ],
            ),
          ),
        ],
        body: TabBarView(controller: _tabs, children: [
          _buildBioTab(),
          _buildSkillsTab(),
          _buildRatesTab(),
        ]),
      ),
    );
  }

  Widget _buildBioTab() => SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Column(children: [
      // Avatar upload
      GestureDetector(
        onTap: _pickAndUploadAvatar,
        child: Container(
          margin: const EdgeInsets.only(bottom: 16),
          child: Stack(alignment: Alignment.bottomRight, children: [
            CircleAvatar(
              radius: 44,
              backgroundColor: AppColors.primaryPale,
              backgroundImage: _avatarUrl != null ? CachedNetworkImageProvider(_avatarUrl!) : null,
              child: _avatarUrl == null
                ? const Icon(Icons.person_rounded, size: 44, color: AppColors.primary)
                : null),
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2)),
              child: const Icon(Icons.camera_alt_rounded, size: 14, color: Colors.white)),
          ])),
      ),
      _SectionCard(
        title: 'About you',
        child: Column(children: [
          TextField(controller: _bioCtrl, maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'e.g. Route sales rep, 3 years FMCG, own motorbike. Strong customer relationships.',
              border: OutlineInputBorder(), contentPadding: EdgeInsets.all(12)),
            style: const TextStyle(fontSize: 13)),
        ]),
      ),
      const SizedBox(height: 12),
      _SectionCard(
        title: 'Location',
        child: Column(children: [
          TextField(controller: _locationCtrl,
            decoration: const InputDecoration(
              hintText: 'e.g. Westlands, Nairobi', prefixIcon: Icon(Icons.location_on, size: 18),
              border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(vertical: 12, horizontal: 12)),
            style: const TextStyle(fontSize: 13)),
        ]),
      ),
      const SizedBox(height: 12),
      _SectionCard(
        title: 'M-Pesa payment phone',
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          TextField(controller: _mpesaCtrl, keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              hintText: '0712 345 678', prefixIcon: Icon(Icons.phone_android, size: 18),
              border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(vertical: 12, horizontal: 12)),
            style: const TextStyle(fontSize: 13)),
          const SizedBox(height: 6),
          const Text('Managers send payments to this number', style: TextStyle(fontSize: 11, color: AppColors.text4)),
        ]),
      ),
      const SizedBox(height: 20),
      SizedBox(width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _saving ? null : _saveProfile,
          icon: const Icon(Icons.save, size: 16),
          label: Text(_saving ? 'Saving...' : 'Save profile'),
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
        )),
    ]),
  );

  Widget _buildSkillsTab() {
    if (_loadingSkills) return const Center(child: CircularProgressIndicator());

    final cats = ['all', ...{..._allSkills.map((s) => s['category']?.toString() ?? 'general')}];
    final filtered = _allSkills.where((s) {
      final matchCat = _skillCat == 'all' || s['category'] == _skillCat;
      final matchQ   = _skillSearch.isEmpty || (s['name'] as String).toLowerCase().contains(_skillSearch.toLowerCase());
      return matchCat && matchQ;
    }).toList();

    // Selected skills
    final mySkills = _allSkills.where((s) => _mySkillIds.contains(s['id'])).toList();

    return Column(children: [
      if (mySkills.isNotEmpty)
        Container(
          width: double.infinity, padding: const EdgeInsets.all(12),
          color: AppColors.primaryPale,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Your skills (${mySkills.length})',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: mySkills.map((s) {
              final color = _catColor(s['category']);
              return GestureDetector(
                onTap: () => setState(() => _mySkillIds.remove(s['id'])),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(10, 4, 6, 4),
                  decoration: BoxDecoration(color: color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: color.withOpacity(0.4))),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(s['name'] as String, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color)),
                    const SizedBox(width: 4),
                    Icon(Icons.close, size: 12, color: color),
                  ]),
                ),
              );
            }).toList()),
          ]),
        ),

      // Search + category filter
      Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
          TextField(
            onChanged: (v) => setState(() => _skillSearch = v),
            decoration: const InputDecoration(
              hintText: 'Search skills...', prefixIcon: Icon(Icons.search, size: 18),
              border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              isDense: true),
            style: const TextStyle(fontSize: 13)),
          const SizedBox(height: 8),
          SingleChildScrollView(scrollDirection: Axis.horizontal,
            child: Row(children: cats.map((c) {
              final active = _skillCat == c;
              return GestureDetector(
                onTap: () => setState(() => _skillCat = c),
                child: Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: active ? AppColors.primary : Colors.white,
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(color: active ? AppColors.primary : AppColors.border)),
                  child: Text(c == 'all' ? 'All' : c,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                      color: active ? Colors.white : AppColors.text2)),
                ),
              );
            }).toList()),
          ),
        ]),
      ),

      // Skills grid
      Expanded(child: GridView.builder(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 80),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2, crossAxisSpacing: 8, mainAxisSpacing: 8, childAspectRatio: 2.8),
        itemCount: filtered.length,
        itemBuilder: (_, i) {
          final s        = filtered[i];
          final selected = _mySkillIds.contains(s['id']);
          final color    = _catColor(s['category']);
          return GestureDetector(
            onTap: () => setState(() {
              if (selected) _mySkillIds.remove(s['id']);
              else _mySkillIds.add(s['id'].toString());
            }),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: selected ? color.withOpacity(0.1) : Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: selected ? color : AppColors.border, width: selected ? 1.5 : 0.5)),
              child: Row(children: [
                Container(width: 22, height: 22, decoration: BoxDecoration(
                  color: selected ? color : AppColors.surface, borderRadius: BorderRadius.circular(6)),
                  child: selected ? Icon(Icons.check, size: 13, color: Colors.white) : null),
                const SizedBox(width: 8),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text(s['name'] as String,
                    style: TextStyle(fontSize: 11, fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected ? color : AppColors.text1),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text(s['category'] as String,
                    style: const TextStyle(fontSize: 9, color: AppColors.text4)),
                ])),
              ]),
            ),
          );
        },
      )),

      // Add "Other" custom skill
      Container(
        margin: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(8)),
        child: _addingOther
          ? Padding(
              padding: const EdgeInsets.all(10),
              child: Row(children: [
                Expanded(child: TextField(
                  controller: _otherSkillCtrl, autofocus: true,
                  style: const TextStyle(fontSize: 13),
                  decoration: InputDecoration(
                    hintText: 'Custom skill name...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)))),
                const SizedBox(width: 8),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                  onPressed: () async {
                    final name = _otherSkillCtrl.text.trim();
                    if (name.isEmpty) return;
                    final api = context.read<ApiClient>();
                    try {
                      final newSkill = await api.createOrFindSkill(name, 'general');
                      final skillId = newSkill['id']?.toString();
                      if (skillId != null && mounted) {
                        setState(() {
                          if (!_mySkillIds.contains(skillId)) _mySkillIds.add(skillId);
                          if (!_allSkills.any((s) => s['id'] == skillId)) _allSkills.add(newSkill);
                          _addingOther = false;
                          _otherSkillCtrl.clear();
                        });
                      }
                    } catch (_) { if (mounted) setState(() => _addingOther = false); }
                  },
                  child: const Text('Add')),
                TextButton(onPressed: () => setState(() { _addingOther = false; _otherSkillCtrl.clear(); }),
                  child: const Text('Cancel')),
              ]))
          : ListTile(
              dense: true, leading: const Icon(Icons.add_circle_outline, color: AppColors.primary, size: 20),
              title: const Text('Add custom skill (Other)', style: TextStyle(fontSize: 12, color: AppColors.primary, fontWeight: FontWeight.w600)),
              onTap: () => setState(() => _addingOther = true)),
      ),
      const SizedBox(height: 8),

      // Save button
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: SafeArea(
          child: SizedBox(width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _saving ? null : _saveSkills,
              icon: const Icon(Icons.save, size: 16),
              label: Text(_saving ? 'Saving...' : 'Save ${_mySkillIds.length} skills'),
              style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
            )),
        ),
      ),
    ]);
  }

  Widget _buildRatesTab() => SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Column(children: [
      _SectionCard(
        title: 'Your rates',
        child: Column(children: [
          Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Daily rate (KES)', style: TextStyle(fontSize: 11, color: AppColors.text3, fontWeight: FontWeight.w600)),
              const SizedBox(height: 5),
              TextField(controller: _dailyCtrl, keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: '1500', border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10), isDense: true),
                style: const TextStyle(fontSize: 13)),
            ])),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Hourly rate (KES)', style: TextStyle(fontSize: 11, color: AppColors.text3, fontWeight: FontWeight.w600)),
              const SizedBox(height: 5),
              TextField(controller: _hourlyCtrl, keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: '250', border: OutlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10), isDense: true),
                style: const TextStyle(fontSize: 13)),
            ])),
          ]),
        ]),
      ),
      const SizedBox(height: 12),
      _SectionCard(
        title: 'Availability',
        child: Column(children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Available for work', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              Text('Employers can find and contact you', style: TextStyle(fontSize: 12, color: AppColors.text4)),
            ]),
            Switch(value: _isAvailable, activeThumbColor: AppColors.primary,
              onChanged: (v) => setState(() => _isAvailable = v)),
          ]),
        ]),
      ),
      const SizedBox(height: 20),
      Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(
        color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFCD34D))),
        child: const Row(children: [
          Text('💡', style: TextStyle(fontSize: 16)),
          SizedBox(width: 10),
          Expanded(child: Text(
            'Workers with complete profiles get 3× more employer views',
            style: TextStyle(fontSize: 12, color: Color(0xFF92400E), height: 1.5))),
        ])),
      const SizedBox(height: 20),
      SizedBox(width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _saving ? null : _saveProfile,
          icon: const Icon(Icons.save, size: 16),
          label: Text(_saving ? 'Saving...' : 'Save rates'),
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
        )),
    ]),
  );
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity, padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppColors.border, width: 0.5)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
        color: AppColors.text3, letterSpacing: 0.4, height: 1)),
      const SizedBox(height: 10),
      child,
    ]),
  );
}

class _Pill extends StatelessWidget {
  final String label;
  const _Pill(this.label);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), borderRadius: BorderRadius.circular(99)),
    child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600)),
  );
}
