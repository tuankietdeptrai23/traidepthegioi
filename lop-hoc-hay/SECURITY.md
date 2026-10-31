# Bảo mật

## Danh tính

Người dùng thông thường đăng nhập bằng ID/mật khẩu do admin cấp, không cần email. ID duy nhất được chuẩn hóa về chữ thường. PBKDF2-SHA256 100.000 vòng với salt ngẫu nhiên 128-bit; so sánh hash qua vòng lặp có cùng số bước.

Phiên ngẫu nhiên 256-bit, chỉ hash SHA-256 của token được lưu trong D1. Cookie HttpOnly, Secure trên HTTPS, SameSite=Lax, Path=/ và Max-Age 90 ngày. Không lưu mật khẩu/token trong localStorage. Khóa tài khoản và đặt lại mật khẩu hủy phiên cũ; phiên kiểm tra active, hạn dùng và phiên bản mật khẩu trên mỗi API.

Thử đăng nhập bị giới hạn theo hash ID/IP và IP trong cửa sổ 15 phút. Không ghi mật khẩu hoặc hash/salt vào API state hay audit. Khi quên mật khẩu, liên hệ admin để được đặt lại, chưa có luồng tự khôi phục.

## Khởi tạo admin

`settings.owner` là chủ sở hữu đã được xác định tin cậy. Chỉ danh tính ChatGPT trùng chủ sở hữu đó, có user admin hoạt động và chưa có mật khẩu mới được khởi tạo ID quản trị một lần. Các request đồng thời được bảo vệ bằng guard giao dịch. Không tự cấp admin cho người truy cập đầu tiên trên website công khai.

Nhánh danh tính phát triển trong helper ChatGPT bị loại khỏi production. Nó không cấp phiên ID/mật khẩu. Nếu tự host ngoài Sites, cần thay cách xác thực chủ sở hữu cho bootstrap hoặc tự cấp admin qua công cụ quản trị đáng tin cậy; không tin header xác thực do client tự gửi.

## Phân quyền và request

Mỗi API kiểm tra tài khoản hoạt động và quyền theo lớp/tổ. Học sinh chỉ nhận chi tiết hồ sơ của mình; tổ trưởng giới hạn phạm vi tổ. Quyền quản trị trường chỉ cho admin. Băm mật khẩu và phiên không xuất qua API đọc, kể cả với admin.

Các POST yêu cầu Origin cùng origin, Content-Type JSON và giới hạn kích thước. React escape văn bản. Minh chứng chỉ nhận HTTPS; CSV tránh ô công thức phổ biến.

Đường dẫn website công khai không có nghĩa dữ liệu công khai. Không đưa dữ liệu thật hay credential vào Git. Quản lí sao lưu D1, quyền nền tảng và xét quyền từng vai trò trước khi dùng ở quy mô lớn. Không tự gửi đánh giá hoặc quyết định rèn luyện cho bên thứ ba.

Giáo viên phụ trách được nhập danh sách để cấp tài khoản **student** trong đúng lớp của mình, không được tự tạo teacher/admin. Mật khẩu ban đầu 12345678 theo quy định của chủ sở hữu; hệ thống nhắc học sinh đổi. Thay mật khẩu cá nhân hủy các phiên cũ. Bảng thi đua lớp chỉ công bố số lần và điểm đã duyệt; chi tiết chưa duyệt vẫn theo phạm vi tổ/lớp.

## Study rooms

All study endpoints require an active custom app session. Invitation links admit an authenticated account into only the nominated room; they never grant class, grades, discipline or administration access. Invitations are unguessable and host-rotatable; locking blocks new members while existing members retain access. A new join replaces that user's prior peer in the room. Active occupancy is bounded to eight peers; heartbeat leases remove stale peers. SDP/ICE messages are restricted to the sender's own peer and a live recipient in the same room, expire after two minutes, and are never broadcast to other room members. Host controls are enforced server-side. Messages and board events are readable by admitted members, including when they return later. Do not post secrets in room chat.

Avatars allow a fixed emoji set or bounded PNG/JPEG/WebP data with magic-byte validation; remote URLs and SVG are rejected. Image processing is client-side. Scientific expressions use an allowlisted parser, never JavaScript evaluation. Writes require same-origin JSON. Basic room-create, event and signaling rate bounds limit accidental flooding. Optional TURN API secrets stay on the Worker; temporary ICE credentials are available only for an authenticated live peer. Media is peer-to-peer WebRTC (or TURN-relayed when configured), with browser permission required for microphone, camera and display capture. Room calls have no automatic time cutoff; device/network/browser lifecycle can interrupt them. The service does not record media. Account deactivation revokes API access and peers disappear after their lease; an already-established peer media transport may persist until the next successful room poll or disconnect.
