# Kiến trúc

## Cấu trúc mã

- `app/class-app.tsx`: ứng dụng React, biểu mẫu và các màn hình.
- `app/globals.css`: thiết kế thích ứng và bản in.
- `lib/auth.ts`: mật khẩu băm, đăng nhập ID, phiên cookie, giới hạn đăng nhập và khởi tạo admin.
- `app/api/auth/route.ts`: kiểm tra phiên, đăng nhập, đăng xuất, đổi mật khẩu và thiết lập admin lần đầu.
- `app/login-screen.tsx`: màn hình đăng nhập và thiết lập quản trị.
- `app/chatgpt-auth.ts`: chỉ xác thực chủ sở hữu cho lần thiết lập quản trị đầu tiên.
- `app/api/state/route.ts`: đọc trạng thái có lọc quyền, `Cache-Control: no-store`.
- `app/api/action/route.ts`: kiểm tra Origin, Content-Type và kích thước JSON, gọi nghiệp vụ.
- `lib/server.ts`: xác thực, kiểm tra lớp/tổ, nghiệp vụ và batch giao dịch.
- `lib/domain.ts`: quy tắc, xếp hạng, ảnh chụp tuần và sinh lịch trực.
- `db/schema.ts`, `drizzle/`: cấu trúc và migration.
- `tests/integration.mjs`: chạy lớp nghiệp vụ production trên SQLite qua adapter D1.

## Dữ liệu

19 bảng (cộng auth_sessions và auth_attempts): users, settings, classes, groups, students, entries, reports, periods, grades, conduct, funds, activities, duties, notices, feedback, audit, guards.

Khóa tài khoản ổn định liên kết users và students. Các cột tên email cũ được giữ tương thích; ID đăng nhập riêng ở users.login_id, không yêu cầu email. Quyền cán sự đặt trong từng bản ghi students, không đặt ở user toàn hệ thống. Giáo viên được giao qua teacher_email của lớp và phải có role teacher đang hoạt động; admin có quyền toàn hệ thống.

entries lưu tên quy tắc và delta tại lúc tạo, không tính lại từ tên quy tắc mới. periods lưu JSON ảnh chụp kết quả khi chốt. Hồ sơ chính thức không thể được thay bằng thao tác tự ghi điểm của học sinh.

## Giao dịch cập nhật

Mọi thay đổi lớp đọc revision trước khi kiểm tra nghiệp vụ. Batch gồm:

1. INSERT guard với CHECK thành công khi revision còn khớp.
2. Các INSERT / UPDATE nghiệp vụ.
3. Tăng revision lớp.
4. Ghi audit.
5. Xóa guard tạm.

Batch D1 có tính nguyên tử; CHECK thất bại hủy toàn bộ thay đổi. Vì vậy, một báo cáo cập nhật đồng thời lúc chốt không thể âm thầm làm kết quả snapshot sai. Người dùng nhận lỗi 409 và tải lại.

Thay đổi tài khoản và tạo lớp là thao tác admin độc lập; log của hai thao tác này được ghi sau thao tác, không nằm trong cùng batch lớp. Audit phục vụ truy vết vận hành, chưa phải hệ thống bằng chứng bất biến chống sửa ở cấp quản trị cơ sở dữ liệu.

## Online study

`/api/study` implements authenticated room membership, host controls, signaling polling, board/chat log and self avatar updates. Tables `study_rooms`, `study_members`, `study_peers`, `study_signals`, `study_events` are added by migration 0004; `users.avatar` is a compressed bounded data URL or emoji. Existing class authorization remains separate. Room join uses a revision guard and a transactional batch to enforce occupancy, membership and replacement of an earlier peer. The client polls every 1.8 seconds, heartbeats every 15 seconds, and considers a peer stale at 60 seconds. Signaling rows older than 120 seconds are pruned on heartbeat. Persistent room history ends only on a host action, not elapsed duration.

`use-study-call.ts` establishes one RTCPeerConnection per remote participant, with fixed mic, camera, display video and display audio transceivers. A deterministic peer-ID order chooses the offerer. Call controls use replaceTrack to preserve channels when toggling sources. Explicit leave, pagehide and unmount stop local media. WebRTC is a mesh for small groups (eight concurrent participants); scaling to classroom-sized video requires an SFU and separate capacity planning. The UI visibly reports direct-only networking if no TURN credentials are configured. Chat/whiteboard history is stored in D1; calculators and focus timer are local. Board operations are validated, deduplicated by operation ID, and replayed in server order. Clear appends an idempotent event; clients display strokes after the latest clear. Earlier board history and chat remain stored for replay. No official Casio ROM, SDK or trademark assets are used.

Browser QA used two hook instances with synthetic media and an in-memory signaling transport. SDP offer/answer negotiated four sendrecv transceivers; chat and board replay reached both instances. The managed HTTP preview browser produced no ICE candidates, so end-to-end media delivery, real device permissions, display capture/audio and cross-network TURN remain unverified. Validate those with two actual HTTPS devices before relying on calls.
