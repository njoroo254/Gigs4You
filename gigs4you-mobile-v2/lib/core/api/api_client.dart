import 'dart:async';

import 'package:dio/dio.dart';
import '../storage/auth_storage.dart';

class ApiClient {
  // For production, use HTTPS with your domain
  // Development: HTTP for local testing
  static const bool isProduction =
      const bool.fromEnvironment('dart.vm.product');
  static const baseUrl = isProduction
      ? 'https://api.gigs4you.co.ke/api/v1'
      : 'http://10.0.2.2:3000/api/v1';

  // WebSocket base — same host/port but without /api/v1 path
  static const wsBase =
      isProduction ? 'wss://api.gigs4you.co.ke' : 'http://10.0.2.2:3000';

  late final Dio _dio;
  late final Dio _refreshDio;
  final _storage = AuthStorage();
  Future<String?>? _refreshFuture;

  ApiClient() {
    final options = BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Content-Type': 'application/json'},
    );
    _dio = Dio(options);
    _refreshDio = Dio(options);

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.getToken();
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        return handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401 &&
            _shouldAttemptRefresh(error.requestOptions)) {
          final refreshedToken = await _refreshAccessToken();
          if (refreshedToken != null) {
            try {
              final response =
                  await _retryRequest(error.requestOptions, refreshedToken);
              return handler.resolve(response);
            } catch (_) {
              await _storage.clear();
            }
          } else {
            await _storage.clear();
          }
        }
        return handler.next(error);
      },
    ));
  }

  bool _shouldAttemptRefresh(RequestOptions options) {
    if (options.extra['retried'] == true ||
        options.extra['skipAuthRefresh'] == true) {
      return false;
    }

    const excludedPaths = {
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
      '/auth/forgot-password',
      '/auth/reset-password',
    };
    return !excludedPaths.contains(options.path);
  }

  Future<String?> _refreshAccessToken() async {
    _refreshFuture ??= _performRefresh();
    try {
      return await _refreshFuture;
    } finally {
      _refreshFuture = null;
    }
  }

  Future<String?> _performRefresh() async {
    final refreshToken = await _storage.getRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      return null;
    }

    try {
      final response = await _refreshDio.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {'skipAuthRefresh': true}),
      );
      final data = response.data is Map
          ? Map<String, dynamic>.from(response.data as Map)
          : <String, dynamic>{};

      final accessToken = data['access_token'] as String?;
      if (accessToken == null || accessToken.isEmpty) {
        return null;
      }

      await _storage.saveToken(accessToken);

      final newRefreshToken = data['refresh_token'] as String?;
      if (newRefreshToken != null && newRefreshToken.isNotEmpty) {
        await _storage.saveRefreshToken(newRefreshToken);
      }

      final user = data['user'];
      if (user is Map) {
        await _storage.saveUser(Map<String, dynamic>.from(user));
      }

      return accessToken;
    } catch (_) {
      return null;
    }
  }

  Future<Response<dynamic>> _retryRequest(
      RequestOptions requestOptions, String token) {
    final headers = Map<String, dynamic>.from(requestOptions.headers);
    headers['Authorization'] = 'Bearer $token';

    return _dio.fetch<dynamic>(requestOptions.copyWith(
      headers: headers,
      extra: {
        ...requestOptions.extra,
        'retried': true,
      },
    ));
  }

  // ── Auth ─────────────────────────────────────────
  // ── Generic HTTP methods for direct API calls ─────────────────────
  Future<Map<String, dynamic>> post(
      String path, Map<String, dynamic> data) async {
    final res = await _dio.post(path, data: data);
    return res.data is Map
        ? Map<String, dynamic>.from(res.data as Map)
        : {'data': res.data};
  }

  Future<Map<String, dynamic>> get(String path,
      {Map<String, dynamic>? params}) async {
    final res = await _dio.get(path, queryParameters: params);
    return res.data is Map
        ? Map<String, dynamic>.from(res.data as Map)
        : {'data': res.data};
  }

  Future<Map<String, dynamic>> patch(
      String path, Map<String, dynamic> data) async {
    final res = await _dio.patch(path, data: data);
    return res.data is Map
        ? Map<String, dynamic>.from(res.data as Map)
        : {'data': res.data};
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

  Future<Map<String, dynamic>> loginWithIdentifier(
      String identifier, String password) async {
    final res = await _dio.post('/auth/login', data: {
      'identifier': identifier,
      'password': password,
    });
    return res.data;
  }

  Future<Map<String, dynamic>> login(String phone, String password) async {
    final res = await _dio
        .post('/auth/login', data: {'phone': phone, 'password': password});
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
    final res = await _dio
        .post('/agents/checkin', data: {'latitude': lat, 'longitude': lng});
    return res.data;
  }

  Future<Map<String, dynamic>> checkOut() async {
    final res = await _dio.post('/agents/checkout');
    return res.data;
  }

  Future<void> pingLocation(double lat, double lng,
      {double? speed, double? accuracy}) async {
    try {
      await _dio.post('/gps/ping', data: {
        'latitude': lat,
        'longitude': lng,
        if (speed != null) 'speed': speed,
        if (accuracy != null) 'accuracy': accuracy,
      });
    } catch (_) {}
  }

  Future<Map<String, dynamic>> updateWorkerProfile(
      Map<String, dynamic> data) async {
    final res = await _dio.patch('/workers/me', data: data);
    return res.data;
  }

  Future<Map<String, dynamic>> updateSkills(List<String> skillIds) async {
    final res =
        await _dio.patch('/workers/me/skills', data: {'skillIds': skillIds});
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
    } catch (_) {
      return [];
    }
  }

  Future<List<dynamic>> getAllMyTasks() async {
    try {
      final res = await _dio.get('/tasks');
      final data = res.data;
      if (data is List) return data;
      return [];
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>> getTaskStats() async {
    try {
      final res = await _dio.get('/tasks/stats');
      return res.data;
    } catch (_) {
      return {'total': 0, 'completed': 0, 'pending': 0, 'completionRate': 0};
    }
  }

  Future<Map<String, dynamic>> startTask(String taskId) async {
    final res = await _dio.patch('/tasks/$taskId/start');
    return res.data;
  }

  Future<Map<String, dynamic>> completeTask(
    String taskId, {
    String? notes,
    List<String>? photoUrls,
    double? latitude,
    double? longitude,
    List<Map<String, dynamic>>? checklistState,
  }) async {
    final res = await _dio.patch('/tasks/$taskId/complete', data: {
      if (notes != null) 'notes': notes,
      if (photoUrls != null && photoUrls.isNotEmpty) 'photoUrls': photoUrls,
      if (latitude != null) 'submittedLatitude': latitude,
      if (longitude != null) 'submittedLongitude': longitude,
      if (checklistState != null && checklistState.isNotEmpty) 'checklistState': checklistState,
    });
    return res.data;
  }

  /// Upload a task completion photo — returns the public URL or null on failure.
  Future<String?> uploadTaskPhoto(String filePath, {String? taskId}) async {
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(
          filePath,
          filename: 'task_photo_${DateTime.now().millisecondsSinceEpoch}.jpg',
        ),
      });
      final res = await _dio.post(
        '/upload/task-photo',
        data: formData,
        queryParameters: taskId != null ? {'taskId': taskId} : null,
      );
      return (res.data as Map?)?['url'] as String?;
    } catch (_) {
      return null;
    }
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
    final res =
        await _dio.patch('/tasks/$taskId/decline', data: {'reason': reason});
    return res.data;
  }

  Future<Map<String, dynamic>> failTask(String taskId, String reason) async {
    final res =
        await _dio.patch('/tasks/$taskId/fail', data: {'reason': reason});
    return res.data;
  }

  // ── Jobs marketplace ──────────────────────────────
  Future<Map<String, dynamic>> getJobsRaw(
      {String? category, String? search, bool myPostings = false}) async {
    try {
      final res = await _dio.get('/jobs', queryParameters: {
        if (category != null && category != 'all') 'category': category,
        if (search != null && search.isNotEmpty) 'search': search,
        if (myPostings) 'mine': 'true',
      });
      return res.data is Map ? res.data : {'jobs': res.data ?? []};
    } catch (_) {
      return {'jobs': []};
    }
  }

  Future<Map<String, dynamic>> createJob(Map<String, dynamic> data) async {
    final res = await _dio.post('/jobs', data: data);
    return res.data;
  }

  Future<Map<String, dynamic>> applyForJob(String jobId,
      {String? coverNote}) async {
    final res = await _dio.post('/jobs/$jobId/apply', data: {
      if (coverNote != null) 'coverNote': coverNote,
    });
    return res.data;
  }

  Future<List<dynamic>> getMyApplications() async {
    try {
      final res = await _dio.get('/jobs/my-applications');
      return res.data as List;
    } catch (_) {
      return [];
    }
  }

  // ── Wallet (agent) ───────────────────────────────
  Future<Map<String, dynamic>> getWallet() async {
    try {
      final res = await _dio.get('/wallet');
      return res.data;
    } catch (_) {
      return {'balance': 0, 'pendingBalance': 0, 'currency': 'KES'};
    }
  }

  Future<List<dynamic>> getTransactions() async {
    try {
      final res = await _dio.get('/wallet/transactions');
      return res.data as List;
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>> requestWithdrawal(
      double amount, String mpesaPhone) async {
    final res = await _dio.post('/wallet/withdraw', data: {
      'amount': amount,
      'mpesaPhone': mpesaPhone,
    });
    return res.data;
  }

  // ── Wallet (org / management) ─────────────────────
  Future<Map<String, dynamic>> getOrgWallet() async {
    try {
      final res = await _dio.get('/wallet/org');
      return res.data is Map
          ? Map<String, dynamic>.from(res.data as Map)
          : {};
    } catch (_) {
      return {'balance': 0, 'totalDeposited': 0, 'totalDisbursed': 0};
    }
  }

  Future<List<dynamic>> getOrgTransactions({int limit = 50, String? from, String? to}) async {
    try {
      final res = await _dio.get('/wallet/org/transactions', queryParameters: {
        'limit': limit,
        if (from != null) 'from': from,
        if (to != null) 'to': to,
      });
      return res.data is List ? res.data as List : [];
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>> topupOrgWallet(String phone, double amount) async {
    final res = await _dio.post('/mpesa/topup', data: {
      'phone': phone,
      'amount': amount,
    });
    return res.data is Map
        ? Map<String, dynamic>.from(res.data as Map)
        : {};
  }

  // ── Skills ────────────────────────────────────────
  // ── Chat ──────────────────────────────────────────────────────────
  Future<List<dynamic>> getConversations() async {
    final res = await _dio.get('/chat/conversations');
    final data = res.data;
    if (data is List) return data;
    return [];
  }

  Future<List<dynamic>> getMessages(String otherId, {int limit = 50}) async {
    final res = await _dio.get('/chat/conversations/$otherId/messages',
        queryParameters: {'limit': limit});
    final data = res.data;
    if (data is List) return data;
    return [];
  }

  Future<Map<String, dynamic>> sendMessage(String otherId, String body,
      {String? taskId, String? attachmentUrl}) async {
    final res = await _dio.post('/chat/conversations/$otherId/messages', data: {
      'body': body,
      if (taskId != null) 'taskId': taskId,
      if (attachmentUrl != null) 'attachmentUrl': attachmentUrl,
    });
    return res.data;
  }

  // ── Agents ───────────────────────────────────────────────────────
  /// Returns org contacts for the current user — works for all roles including agents.
  Future<List<dynamic>> getChatContacts() async {
    try {
      final res = await _dio.get('/chat/contacts');
      final data = res.data;
      if (data is List) return data;
      return [];
    } catch (_) {
      return [];
    }
  }

  Future<List<dynamic>> getOrgAgents() async {
    try {
      final res = await _dio.get('/agents');
      final data = res.data;
      if (data is List) return data;
      if (data is Map && data['agents'] != null) return data['agents'] as List;
      return [];
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>> createTask(Map<String, dynamic> data) async {
    final res = await _dio.post('/tasks', data: data);
    return res.data;
  }

  Future<Map<String, dynamic>> updateTask(
      String taskId, Map<String, dynamic> data) async {
    final res = await _dio.patch('/tasks/$taskId', data: data);
    return res.data;
  }

  Future<void> cancelTask(String taskId) async {
    await _dio.delete('/tasks/$taskId');
  }

  Future<Map<String, dynamic>> getSystemStatus() async {
    try {
      final res = await _dio.get('/health');
      final data = res.data;
      if (data is Map) {
        return Map<String, dynamic>.from(data);
      }
      return {'status': 'online'};
    } catch (_) {
      return {'status': 'offline'};
    }
  }

  Future<void> markRead(String otherId) async {
    await _dio.patch('/chat/conversations/$otherId/read');
  }

  // ── Group chat ────────────────────────────────────────────────────
  Future<List<dynamic>> getChatGroups() async {
    try {
      final res = await _dio.get('/chat/groups');
      final data = res.data;
      if (data is List) return data;
      if (data is Map && data['groups'] != null) return data['groups'] as List;
      return [];
    } catch (_) {
      return [];
    }
  }

  Future<List<dynamic>> getGroupMessages(String groupId, {int limit = 60}) async {
    try {
      final res = await _dio.get('/chat/groups/$groupId/messages',
          queryParameters: {'limit': limit});
      final data = res.data;
      if (data is List) return data;
      return [];
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>> sendGroupMessage(String groupId, String body,
      {String? attachmentUrl}) async {
    final res = await _dio.post('/chat/groups/$groupId/messages', data: {
      'body': body,
      if (attachmentUrl != null) 'attachmentUrl': attachmentUrl,
    });
    return res.data is Map ? Map<String, dynamic>.from(res.data as Map) : {};
  }

  Future<int> getUnreadCount() async {
    final res = await _dio.get('/chat/unread-count');
    return res.data as int? ?? 0;
  }

  Future<Map<String, dynamic>> createOrFindSkill(
      String name, String category) async {
    final res =
        await _dio.post('/skills', data: {'name': name, 'category': category});
    return res.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getSkills({String? category}) async {
    try {
      final res = await _dio.get('/skills', queryParameters: {
        if (category != null) 'category': category,
      });
      return res.data as List;
    } catch (_) {
      return [];
    }
  }

  // ── Notifications ─────────────────────────────────
  Future<List<dynamic>> getNotifications() async {
    try {
      final res = await _dio.get('/notifications');
      return res.data as List;
    } catch (_) {
      return [];
    }
  }

  Future<void> markNotificationRead(String id) async {
    try {
      await _dio.patch('/notifications/$id/read');
    } catch (_) {}
  }

  // ── Cathy AI ──────────────────────────────────────────────────────
  /// Send a message to Cathy and return her reply text.
  /// Throws on network/auth failure so the caller can handle gracefully.
  Future<String> chatWithCathy(String conversationId, String message) async {
    final res = await _dio.post('/ai/mobile/chat', data: {
      'conversation_id': conversationId,
      'message': message,
    });
    final data = res.data;
    if (data is Map) {
      // NestJS wraps FastAPI response: { data: { reply: "..." } }
      final nested = data['data'];
      if (nested is Map) {
        final reply = nested['reply'] as String?;
        if (reply != null) return reply;
      }
      // Fallback for direct response format
      return (data['response'] as String?) ?? 'Sorry, I didn\'t get a response. Please try again.';
    }
    throw Exception('Unexpected response format from AI service');
  }

  // ── Account update (non-sensitive fields only) ───────────────────
  Future<void> updateMyAccount({String? name}) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (body.isEmpty) return;
    await _dio.patch('/auth/me', data: body);
  }

  // ── Account verification (signup flow) ───────────────────────────
  /// Verify the 2FA OTP issued during login (POST /auth/verify-otp).
  /// Returns full auth data (access_token, refresh_token, user).
  Future<Map<String, dynamic>> verifyLoginOtp(
      String challengeToken, String code) async {
    final res = await _dio.post('/auth/verify-otp', data: {
      'challengeToken': challengeToken,
      'code': code,
    }, options: Options(extra: {'skipAuthRefresh': true}));
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> verifyContact(
    String verificationToken, String type, String code) async {
    final res = await _dio.post('/auth/verify-contact', data: {
      'verificationToken': verificationToken,
      'type': type,
      'code': code,
    }, options: Options(extra: {'skipAuthRefresh': true}));
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<void> resendVerification(String verificationToken, String type) async {
    await _dio.post('/auth/resend-verification', data: {
      'verificationToken': verificationToken,
      'type': type,
    }, options: Options(extra: {'skipAuthRefresh': true}));
  }

  // ── Contact update verification (profile change) ─────────────────
  Future<void> requestContactUpdate(String type, String newValue) async {
    await _dio.post('/auth/request-contact-update', data: {
      'type': type, 'newValue': newValue,
    });
  }

  Future<void> verifyContactUpdate(String type, String code) async {
    await _dio.post('/auth/verify-contact-update', data: {
      'type': type, 'code': code,
    });
  }

  // ── Disputes ─────────────────────────────────────────────────────────
  Future<List<dynamic>> getMyDisputes() async {
    try {
      final res = await _dio.get('/disputes/mine');
      return res.data as List;
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>> fileDispute({
    required String type,
    required String description,
    required String againstUserId,
    double? amountKes,
  }) async {
    final res = await _dio.post('/disputes', data: {
      'type': type,
      'description': description,
      'againstUserId': againstUserId,
      if (amountKes != null) 'amountKes': amountKes,
    });
    return Map<String, dynamic>.from(res.data as Map);
  }
}
