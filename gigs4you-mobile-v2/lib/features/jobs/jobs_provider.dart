import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';

class JobsProvider extends ChangeNotifier {
  final ApiClient _api;

  List<Job> jobs = [];
  List<Job> myApplications = [];
  bool loading = false;
  String selectedCategory = 'all';
  String searchQuery = '';
  String? error;

  JobsProvider(this._api);

  final categories = [
    {'id': 'all',          'label': 'All Jobs',     'icon': '💼'},
    {'id': 'sales',        'label': 'Sales',         'icon': '🛒'},
    {'id': 'technician',   'label': 'Technician',    'icon': '🔧'},
    {'id': 'logistics',    'label': 'Delivery',      'icon': '🚴'},
    {'id': 'finance',      'label': 'Finance',       'icon': '💰'},
    {'id': 'research',     'label': 'Research',      'icon': '📋'},
    {'id': 'merchandising','label': 'Merchandising', 'icon': '🏪'},
  ];

  Future<void> loadJobs({double? lat, double? lng}) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final rawMap = await _api.getJobsRaw(
        category: selectedCategory != 'all' ? selectedCategory : null,
        search: searchQuery.isNotEmpty ? searchQuery : null,
      );
      final rawList = rawMap['jobs'] as List? ?? rawMap['items'] as List? ?? [];
      jobs = rawList.map((j) => Job.fromJson(j as Map<String, dynamic>)).toList();
    } catch (e) {
      error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  Future<void> loadMyApplications() async {
    try {
      final raw = await _api.getMyApplications();
      myApplications = raw.map((j) => Job.fromJson(j)).toList();
      notifyListeners();
    } catch (_) {}
  }

  Future<bool> applyForJob(String jobId, {String? coverNote}) async {
    try {
      await _api.applyForJob(jobId, coverNote: coverNote);
      await loadJobs();
      return true;
    } catch (_) {
      return false;
    }
  }

  void setCategory(String cat) {
    selectedCategory = cat;
    loadJobs();
  }

  void setSearch(String query) {
    searchQuery = query;
    loadJobs();
  }

  List<Job> get urgentJobs => jobs.where((j) => j.isUrgent).toList();
}
