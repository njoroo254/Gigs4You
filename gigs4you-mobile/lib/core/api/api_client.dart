import 'package:dio/dio.dart';
import '../storage/auth_storage.dart';

class ApiClient {
  // Emulator: 10.0.2.2 = localhost on your PC
  // Real device: change to your WiFi IP e.g. 192.168.1.100
  static const baseUrl = 'http://10.0.2.2:3000/api/v1';

  late final Dio _dio;
  final _storage = AuthStorage();

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.getToken();
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        return handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) await _storage.clear();
        return handler.next(error);
      },
    ));
  }

  // ── Auth ─────────────────────────────────────────
  // ── Generic HTTP methods for direct API calls ─────────────────────
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> data) async {
    final res = await _dio.post(path, data: data);
    return res.data is Map ? Map<String, dynamic>.from(res.data as Map) : {'data': res.data};
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? params}) async {
    final res = await _dio.get(path, queryParameters: params);
    return res.data is Map ? Map<String, dynamic>.from(res.data as Map) : {'data': res.data};
  }

  Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> data) async {
    final res = await _dio.patch(path, data: data);
    return res.data is Map ? Map<String, dynamic>.from(res.data as Map) : {'data': res.data};
  }

  // ── FCM token registration ──────────────────────────────────────────
  Future<void> registerFcmToken(String token, {String? deviceId}) async {
    try {
      await _dio.post('/auth/fcm-token', data: {
        'token': token,
        if (deviceId != null) 'deviceId': deviceId,
      });
    } catch (_) {}
  }

  Future<void> removeFcmToken(String token) async {
    try {
      await _dio.delete('/auth/fcm-token', data: {'token': token});
    } catch (_) {}
  }

  Future<Map<String, dynamic>> loginWithIdentifier(String identifier, String password) async {
    final res = await _dio.post('/auth/login', data: {
      'identifier': identifier, 'password': password,
    });
    return res.data;
  }

  Future<Map<String, dynamic>> login(String phone, String password) async {
    final res = await _dio.post('/auth/login', data: {'phone': phone, 'password': password});
    return res.data;
  }

  Future<Map<String, dynamic>> register(Map<String, dynamic> data) async {
    final res = await _dio.post('/auth/register', data: data);
    return res.data;
  }

  // ── Agent profile ────────────────────────────────
  Future<Map<String, dynamic>?> getWorkerProfile() async {
    try {
      final res = await _dio.get('/workers/me');
      return res.data;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      return null;
    }
  }

  Future<Map<String, dynamic>?> getMyProfile() async {
    try {
      final res = await _dio.get('/agents/me');
      return res.data;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  Future<Map<String, dynamic>> checkIn(double lat, double lng) async {
    final res = await _dio.post('/agents/checkin', data: {'latitude': lat, 'longitude': lng});
    return res.data;
  }

  Future<Map<String, dynamic>> checkOut() async {
    final res = await _dio.post('/agents/checkout');
    return res.data;
  }

  Future<void> pingLocation(double lat, double lng, {double? speed, double? accuracy}) async {
    try {
      await _dio.post('/gps/ping', data: {
        'latitude': lat, 'longitude': lng,
        if (speed != null) 'speed': speed,
        if (accuracy != null) 'accuracy': accuracy,
      });
    } catch (_) {}
  }

  Future<Map<String, dynamic>> updateWorkerProfile(Map<String, dynamic> data) async {
    final res = await _dio.patch('/workers/me', data: data);
    return res.data;
  }

  Future<Map<String, dynamic>> updateSkills(List<String> skillIds) async {
    final res = await _dio.patch('/workers/me/skills', data: {'skillIds': skillIds});
    return res.data;
  }

  // ── Tasks — BUG FIX: use /tasks not /tasks/today ──
  // /tasks/today had a strict date filter — tasks without dueAt never appeared
  Future<List<dynamic>> getTodayTasks() async {
    try {
      // Use /tasks which returns ALL agent tasks (no date filter bug)
      final res = await _dio.get('/tasks');
      final data = res.data;
      if (data is List) return data;
      return [];
    } catch (_) { return []; }
  }

  Future<List<dynamic>> getAllMyTasks() async {
    try {
      final res = await _dio.get('/tasks');
      final data = res.data;
      if (data is List) return data;
      return [];
    } catch (_) { return []; }
  }

  Future<Map<String, dynamic>> getTaskStats() async {
    try {
      final res = await _dio.get('/tasks/stats');
      return res.data;
    } catch (_) { return {'total':0,'completed':0,'pending':0,'completionRate':0}; }
  }

  Future<Map<String, dynamic>> startTask(String taskId) async {
    final res = await _dio.patch('/tasks/$taskId/start');
    return res.data;
  }

  Future<Map<String, dynamic>> completeTask(String taskId, {
    String? notes, List<String>? photoUrls,
    double? latitude, double? longitude,
  }) async {
    final res = await _dio.patch('/tasks/$taskId/complete', data: {
      if (notes != null) 'notes': notes,
      if (photoUrls != null && photoUrls.isNotEmpty) 'photoUrls': photoUrls,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
    });
    return res.data;
  }

  Future<Map<String, dynamic>> uploadAvatar(FormData formData) async {
    final res = await _dio.post('/workers/me/avatar-upload', data: formData);
    return res.data;
  }



  Future<Map<String, dynamic>> acceptTask(String taskId) async {
    final res = await _dio.patch('/tasks/$taskId/accept');
    return res.data;
  }

  Future<Map<String, dynamic>> declineTask(String taskId, String reason) async {
    final res = await _dio.patch('/tasks/$taskId/decline', data: {'reason': reason});
    return res.data;
  }

  Future<Map<String, dynamic>> failTask(String taskId, String reason) async {
    final res = await _dio.patch('/tasks/$taskId/fail', data: {'reason': reason});
    return res.data;
  }

  // ── Jobs marketplace ──────────────────────────────
  Future<Map<String, dynamic>> getJobsRaw({String? category, String? search, bool myPostings = false}) async {
    try {
      final res = await _dio.get('/jobs', queryParameters: {
        if (category != null && category != 'all') 'category': category,
        if (search != null && search.isNotEmpty) 'search': search,
        if (myPostings) 'mine': 'true',
      });
      return res.data is Map ? res.data : {'jobs': res.data ?? []};
    } catch (_) { return {'jobs': []}; }
  }

  Future<Map<String, dynamic>> createJob(Map<String, dynamic> data) async {
    final res = await _dio.post('/jobs', data: data);
    return res.data;
  }

  Future<Map<String, dynamic>> applyForJob(String jobId, {String? coverNote}) async {
    final res = await _dio.post('/jobs/$jobId/apply', data: {
      if (coverNote != null) 'coverNote': coverNote,
    });
    return res.data;
  }

  Future<List<dynamic>> getMyApplications() async {
    try {
      final res = await _dio.get('/jobs/my-applications');
      return res.data as List;
    } catch (_) { return []; }
  }

  // ── Wallet ────────────────────────────────────────
  Future<Map<String, dynamic>> getWallet() async {
    try {
      final res = await _dio.get('/wallet');
      return res.data;
    } catch (_) { return {'balance':0,'pendingBalance':0,'currency':'KES'}; }
  }

  Future<List<dynamic>> getTransactions() async {
    try {
      final res = await _dio.get('/wallet/transactions');
      return res.data as List;
    } catch (_) { return []; }
  }

  Future<Map<String, dynamic>> requestWithdrawal(double amount, String mpesaPhone) async {
    final res = await _dio.post('/wallet/withdraw', data: {
      'amount': amount, 'mpesaPhone': mpesaPhone,
    });
    return res.data;
  }

  // ── Skills ────────────────────────────────────────
  // ── Chat ──────────────────────────────────────────────────────────
  Future<List<dynamic>> getConversations() async {
    final res = await _dio.get('/chat/conversations');
    return res.data as List;
  }

  Future<List<dynamic>> getMessages(String otherId, {int limit = 50}) async {
    final res = await _dio.get('/chat/conversations/$otherId/messages', queryParameters: {'limit': limit});
    return res.data as List;
  }

  Future<Map<String, dynamic>> sendMessage(String otherId, String body, {String? taskId}) async {
    final res = await _dio.post('/chat/conversations/$otherId/messages', data: {
      'body': body,
      if (taskId != null) 'taskId': taskId,
    });
    return res.data;
  }

  // ── Agents ───────────────────────────────────────────────────────
  Future<List<dynamic>> getOrgAgents() async {
    try {
      final res = await _dio.get('/agents');
      final data = res.data;
      if (data is List) return data;
      if (data is Map && data['agents'] != null) return data['agents'] as List;
      return [];
    } catch (_) { return []; }
  }

  Future<Map<String, dynamic>> createTask(Map<String, dynamic> data) async {
    final res = await _dio.post('/tasks', data: data);
    return res.data;
  }

  Future<Map<String, dynamic>> updateTask(String taskId, Map<String, dynamic> data) async {
    final res = await _dio.patch('/tasks/$taskId', data: data);
    return res.data;
  }

  Future<void> cancelTask(String taskId) async {
    await _dio.delete('/tasks/$taskId');
  }

  Future<Map<String, dynamic>> getSystemStatus() async {
    try {
      final res = await _dio.get('/');
      return {'status': 'online'};
    } catch (_) { return {'status': 'offline'}; }
  }

  Future<void> markRead(String otherId) async {
    await _dio.patch('/chat/conversations/$otherId/read');
  }

  Future<int> getUnreadCount() async {
    final res = await _dio.get('/chat/unread-count');
    return res.data as int? ?? 0;
  }

  Future<Map<String, dynamic>> createOrFindSkill(String name, String category) async {
    final res = await _dio.post('/skills', data: {'name': name, 'category': category});
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getSkills({String? category}) async {
    try {
      final res = await _dio.get('/skills', queryParameters: {
        if (category != null) 'category': category,
      });
      return res.data as List;
    } catch (_) { return []; }
  }

  // ── Notifications ─────────────────────────────────
  Future<List<dynamic>> getNotifications() async {
    try {
      final res = await _dio.get('/notifications');
      return res.data as List;
    } catch (_) { return []; }
  }

  Future<void> markNotificationRead(String id) async {
    try { await _dio.patch('/notifications/$id/read'); } catch (_) {}
  }
}
