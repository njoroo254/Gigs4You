import 'package:flutter/material.dart';
import '../profile/profile_tab.dart';

/// Manager/Supervisor/Admin profile — reuses the same ProfileTab
/// (bio, skills, rates, CV) but with a different app bar tint
class ManagerProfileTab extends StatelessWidget {
  const ManagerProfileTab({super.key});
  @override
  Widget build(BuildContext context) => const ProfileTab();
}
