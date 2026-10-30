# Kiến trúc

## Cấu trúc mã

- `app/class-app.tsx`: ứng dụng React, biểu mẫu và các màn hình.
- `app/globals.css`: thiết kế thích ứng và bản in.
- `app/chatgpt-auth.ts`: danh tính do Sites xác thực; nhánh development loại khỏi production.
- `app/api/state/route.ts`: đọc trạng thái có lọc quyền, `Cache-Control: no-store`.
- `app/api/action/route.ts`: kiểm tra Origin, Content-Type và kích thước JSON, gọi nghiệp vụ.
- `lib/server.ts`: xác thực, kiểm tra lớp/tổ, nghiệp vụ và batch giao dịch.
- `lib/domain.ts`: quy tắc, xếp hạng, ảnh chụp tuần và sinh lịch trực.
- `db/schema.ts`, `drizzle/`: cấu trúc và migration.
- `tests/integration.mjs`: chạy lớp nghiệp vụ production trên SQLite qua adapter D1.

## Dữ liệu

17 bảng: users, settings, classes, groups, students, entries, reports, periods, grades, conduct, funds, activities, duties, notices, feedback, audit, guards.

Danh tính email liên kết với users và danh sách students. Quyền cán sự đặt trong từng bản ghi students, không đặt ở user toàn hệ thống. Giáo viên được giao qua teacher_email của lớp và phải có role teacher đang hoạt động; admin có quyền toàn hệ thống.

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
