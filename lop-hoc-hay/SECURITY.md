# Bảo mật và vận hành

## Ranh giới xác thực

Production tin header danh tính do Sites Dispatch cấp. Không dùng app ở một máy chủ Internet khác nhận header do người dùng tùy ý đặt. Muốn tự host cần thay adapter danh tính bằng nhà cung cấp xác thực server-side phù hợp và giữ toàn bộ kiểm tra quyền.

Site tạo mới là riêng tư. Người sở hữu phải mở và khởi tạo admin trước khi mở rộng người xem. Không có endpoint đăng kí admin công khai, không có mật khẩu mặc định. Không đổi quyền truy cập Site trong mã ứng dụng.

## Quyền dữ liệu

- Mọi mutation kiểm tra tài khoản hoạt động, lớp và quyền liên quan.
- Báo cáo tổ được giới hạn theo tổ của tổ trưởng; học sinh xem chi tiết hồ sơ của mình.
- Kết quả tổng hợp tổ có thể xem trong lớp; chi tiết sự việc và email học sinh khác bị lọc ở máy chủ.
- Nhận xét và đánh giá rèn luyện không công khai ngoài phạm vi đã cấp.
- CSRF: bắt buộc Origin cùng origin và JSON cho mutation; không nhận form POST hoặc CORS tùy ý.
- React escape nội dung; liên kết minh chứng chỉ nhận HTTPS; xuất CSV làm vô hiệu ô bắt đầu bằng công thức phổ biến.

## Vận hành

Không đưa dữ liệu học sinh thật, token hoặc file môi trường vào Git. Theo dõi dung lượng D1, quản lí sao lưu và quyền truy cập nền tảng. Khóa người dùng qua admin sẽ chặn các API tiếp theo.

Trước khi dùng quy mô trường: kiểm tra quyền với tài khoản thật của từng vai trò, quy tắc thi đua thực tế, kế hoạch sao lưu/phục hồi và yêu cầu riêng tư của trường. Bản này không tự gửi quyết định kỷ luật hay đánh giá cho bên thứ ba.
