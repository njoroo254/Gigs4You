import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';

class TasksProvider extends ChangeNotifier {
  final ApiClient _api;

  List<Task> tasks     = [];
  bool loading         = false;
  String? error;
  String statusFilter  = 'all';

  TasksProvider(this._api);

  Future<void> loadTasks() async {
    loading = true; error = null; notifyListeners();
    try {
      // BUG FIX: getAllMyTasks() uses GET /tasks which returns all agent tasks
      // (the old /tasks/today had a date filter that silently dropped tasks)
      final data = await _api.getAllMyTasks();
      tasks = data.map((j) => Task.fromJson(j as Map<String, dynamic>)).toList();
    } catch (e) {
      error = e.toString();
    }
    loading = false;
    notifyListeners();
  }

  List<Task> get filtered {
    if (statusFilter == 'all') return tasks;
    return tasks.where((t) => t.status == statusFilter).toList();
  }

  List<Task> get pendingTasks     => tasks.where((t) => t.isPending).toList();
  List<Task> get inProgressTasks  => tasks.where((t) => t.isInProgress).toList();
  List<Task> get completedTasks   => tasks.where((t) => t.isCompleted).toList();
  List<Task> get overdueTasks     => tasks.where((t) => t.isOverdue).toList();

  Future<bool> startTask(String taskId) async {
    try {
      final updated = await _api.startTask(taskId);
      _updateLocal(Task.fromJson(updated));
      return true;
    } catch (e) {
      error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> completeTask(String taskId, {
    String? notes, List<String>? photoUrls,
    double? lat, double? lng,
  }) async {
    try {
      final updated = await _api.completeTask(taskId,
        notes: notes, photoUrls: photoUrls, latitude: lat, longitude: lng);
      _updateLocal(Task.fromJson(updated));
      return true;
    } catch (e) {
      error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> failTask(String taskId, String reason) async {
    try {
      final updated = await _api.failTask(taskId, reason);
      _updateLocal(Task.fromJson(updated));
      return true;
    } catch (e) {
      error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> acceptTask(String taskId) async {
    try {
      final updated = await _api.acceptTask(taskId);
      _updateLocal(Task.fromJson(updated));
      return true;
    } catch (e) {
      error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> declineTask(String taskId, String reason) async {
    try {
      final updated = await _api.declineTask(taskId, reason);
      _updateLocal(Task.fromJson(updated));
      return true;
    } catch (e) {
      error = e.toString();
      notifyListeners();
      return false;
    }
  }

  void setFilter(String f) { statusFilter = f; notifyListeners(); }

  void _updateLocal(Task updated) {
    final idx = tasks.indexWhere((t) => t.id == updated.id);
    if (idx >= 0) tasks[idx] = updated; else tasks.insert(0, updated);
    notifyListeners();
  }

  Map<String, int> get stats => {
    'total':     tasks.length,
    'pending':   pendingTasks.length,
    'active':    inProgressTasks.length,
    'completed': completedTasks.length,
  };
}
