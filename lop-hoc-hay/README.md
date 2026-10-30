# Lớp Học Hay

Web tiếng Việt quản lí nhiều lớp: phân quyền admin / giáo viên / cán sự / học sinh; thi đua theo tổ; vi phạm và rèn luyện; học tập; quỹ lớp; phong trào; trực nhật; sơ đồ lớp.

## Công nghệ thực tế

- React 19, TypeScript, giao diện đáp ứng trên điện thoại và máy tính.
- Next.js App Router chạy qua Vinext, Cloudflare Workers.
- Drizzle ORM và Cloudflare D1 (SQLite). **Không dùng PostgreSQL / Prisma trong bản này.**
- Sites cung cấp đăng nhập ChatGPT và bảo vệ URL triển khai. Ứng dụng kiểm tra vai trò, lớp và tổ ở máy chủ cho từng yêu cầu.
- Không có mật khẩu mẫu hay tài khoản dùng chung trong production.

## Khởi động

Yêu cầu Node.js **24.22+** (kiểm thử dùng `node:sqlite`) và pnpm 11.25+.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate:local
pnpm dev
```

Mở URL được lệnh dev in ra. Trên localhost ở chế độ phát triển, Sites hỗ trợ đăng nhập thử; helper có danh tính `preview@lophochay.test` chỉ trong `import.meta.env.DEV` và host phát triển cho phép. Nhánh này được loại bỏ khỏi production. Dữ liệu local và hosted hoàn toàn riêng.

Nếu chạy trong môi trường Sites được quản lí, dùng lệnh `sites-preview start <đường-dẫn-dự-án>` thay vì tự khởi chạy máy chủ khác.

```bash
pnpm check       # TypeScript
pnpm test        # Kiểm thử nghiệp vụ và phân quyền trên SQLite
pnpm build       # Biên dịch bản production
```

Các dependencies được khóa trong `pnpm-lock.yaml`. `scripts/` chứa cả công cụ hỗ trợ build của Sites; giữ nguyên tích hợp Vite/Worker khi triển khai.

## Thiết lập lần đầu trên bản riêng tư

1. Chủ sở hữu mở bản triển khai riêng tư và đăng nhập ChatGPT. Danh tính xác thực đầu tiên được lưu làm admin; chỉ thực hiện bước này khi Site vẫn owner-private như mặc định.
2. Vào **Quản trị hệ thống → Cấp tài khoản** để cấp quyền theo email ChatGPT của giáo viên.
3. Tạo lớp, chọn năm học, giáo viên phụ trách và số tổ.
4. Giáo viên thêm học sinh hoặc dán danh sách từ Excel; email phải khớp email đăng nhập.
5. Bổ nhiệm chức vụ, chia tổ, xếp sơ đồ và chỉnh quy tắc điểm.
6. Khi cần nhiều người truy cập, cấu hình thêm người xem ở nền tảng Sites. **Cấp tài khoản trong app không tự thay đổi quyền truy cập URL riêng tư.** Không đổi sang public trước khi chủ sở hữu khởi tạo admin.

Có thể tạo 16 học sinh minh họa cho một lớp trống từ Tổng quan. Email mẫu `example.invalid` không tạo người dùng có thể đăng nhập. Production không tự chèn dữ liệu mẫu.

## Tính năng đã triển khai

### Phân quyền

- Admin xem mọi lớp, tạo lớp, cấp / khóa tài khoản, phân công lại giáo viên.
- Giáo viên chỉ quản lí lớp được giao; admin có quyền quản lí các lớp.
- Lớp trưởng / lớp phó học tập / lớp phó nề nếp báo cáo phạm vi lớp. Tổ trưởng chỉ báo cáo tổ mình.
- Thủ quỹ ghi thu chi; giáo viên duyệt.
- Lớp phó phong trào / lớp trưởng tạo hoạt động; giáo viên xác nhận hoàn thành và cộng điểm.
- Học sinh chỉ xem hồ sơ chi tiết của mình, bảng thi đua tổ và thông tin chung. Sổ điểm tự ghi không được đưa cho cán sự hoặc giáo viên khác xem như điểm đã xác nhận.
- Vai trò kiêm nhiệm theo từng lớp. Miễn nhiệm có hiệu lực trên yêu cầu kế tiếp.

### Thi đua

- Mẫu quy tắc từ hướng dẫn lớp 12A2: chuyên cần, điểm KTBC, phát biểu, đồng phục, nề nếp.
- Điểm chuẩn, quy tắc và giới hạn tuần, điểm thưởng tập thể, tổng / trung bình theo sĩ số, mốc gợi ý rèn luyện, số tuần nhất để đề xuất khen thưởng đều chỉnh được.
- Ghi nhận → gửi báo cáo → giáo viên duyệt / trả lại → chốt tuần.
- Báo cáo không phát sinh vẫn cần gửi để xác nhận đủ thông tin. Tổ không có học sinh không cần báo cáo.
- Điểm kiểm tra phải khớp quy tắc KTBC; mỗi điểm một bản ghi. Mỗi học sinh chỉ áp dụng một mốc phát biểu mỗi tuần.
- Một ghi nhận có thể bị giáo viên loại khỏi tính điểm, kèm lý do. Bổ sung báo cáo đã gửi cần trả lại trước.
- Chốt tuần lưu ảnh chụp dữ liệu gồm quy tắc, thành viên, điểm và thứ hạng. Không sửa tuần đã chốt qua giao diện / API.
- Đồng điểm đồng hạng; mọi tổ đồng điểm thấp nhất đều thuộc nhóm phân công trực. Tổ trống không xếp hạng.
- Sự việc giữ nguyên tổ lúc nhập, kể cả khi học sinh chuyển tổ. Điểm chuẩn tổ chưa chốt theo sĩ số hiện tại; điểm phát sinh tính về tổ gốc.
- Cập nhật đồng thời được bảo vệ bằng revision của lớp và giao dịch D1; sai revision hủy cả lần ghi, yêu cầu tải lại.

### Trực nhật

- Chốt tuần tự tạo lịch cho tổ cuối theo số ngày cài đặt.
- Tùy chọn thêm một lượt / học sinh có vi phạm trong tuần; ưu tiên nam đổ rác, luân phiên theo tuần.
- Có nguồn phát sinh và khóa chống trùng cho từng lịch tự sinh.
- Giáo viên phân công bổ sung. Học sinh báo đã làm; cán sự được giao hoặc giáo viên xác nhận / yêu cầu làm lại.
- Các trường hợp miễn, nghỉ hoặc đổi lịch được xử lí bằng phân công bổ sung và nhận xét của giáo viên; chưa có bộ tối ưu lịch theo thời khóa biểu.

### Các nghiệp vụ khác

- Rèn luyện tháng, học kì, cả năm và nhắc nhở / phê bình: giáo viên ghi quyết định cùng lý do; lưu lịch sử, quyết định mới nhất trong cùng kì là hiện hành.
- Cán sự gửi nhận xét; học sinh gửi đính chính; giáo viên phản hồi. Không tự hạ rèn luyện từ điểm.
- Học sinh tự ghi điểm; giáo viên nhập điểm xác nhận; điểm từ báo cáo tổ xuất hiện sau duyệt. Nguồn được phân biệt, không tự ghép điểm thủ công có thể khác bài kiểm tra.
- Quỹ: thu / chi, đóng một phần theo học sinh, mục tiêu quỹ, duyệt, chứng từ dạng liên kết HTTPS. Điều chỉnh bằng giao dịch ngược chiều; giữ bản gốc và ngăn đảo lặp.
- Phong trào: đăng kí / hủy, giáo viên chọn thành viên và xác nhận hoàn thành; cộng điểm một lần cho người tham gia.
- Sơ đồ: chọn học sinh và bấm vị trí, tự xếp, kiểm tra chỗ trùng / vượt sức chứa; tổ và chỗ ngồi độc lập.
- Thông báo, xuất CSV mở được trong Excel, in / lưu PDF bằng trình duyệt, lịch sử thao tác theo lớp.

## Nhập danh sách từ Excel

Dán vùng dữ liệu **không kèm tiêu đề**, mỗi dòng 4 cột, ngăn cách bằng Tab:

| Họ tên | Email | Tên tổ | Giới tính |
| --- | --- | --- | --- |
| Nguyễn Văn An | an@example.com | Tổ 1 | male |
| Trần Ngọc Mai | mai@example.com | Tổ 2 | female |

Giới tính: `male`, `female`, `other`. Tên tổ phải tồn tại. Email trùng trong lớp bị từ chối; một lượt lỗi không nhập dở dang. Tối đa 200 học sinh / lượt. Đây là **dán dữ liệu từ Excel**, chưa phải đọc trực tiếp `.xlsx`.

## Giới hạn được ghi rõ

- Đăng nhập ChatGPT qua Sites; chưa có đăng nhập email/mật khẩu độc lập. Không triển khai nguyên trạng ở Vercel rồi tin các header tự gửi từ Internet.
- PostgreSQL / Supabase chưa được tích hợp. Muốn chuyển cần migration dữ liệu và adapter, không chỉ đổi biến môi trường.
- Minh chứng và chứng từ dùng đường dẫn HTTPS; chưa có tải tệp trực tiếp / R2.
- Quỹ hiện có một mục tiêu / học sinh cho mỗi lớp, chưa có nhiều đợt thu độc lập hoặc miễn giảm theo đợt.
- Khen thưởng tháng đếm theo tháng của ngày đầu tuần. Quy tắc số tuần hiện hành được dùng cho đề xuất tháng, không phải quyết định khen thưởng chính thức.
- Điểm học tập là sổ theo dõi; chưa tính điểm tổng kết môn/học kì theo hệ số hoặc đồng bộ hệ thống nhà trường.
- Các kì đánh giá có tên do giáo viên nhập; chưa có lịch học kì chuẩn hóa. Có thể quản lí nhiều lớp / năm học, chưa có thao tác chuyển khóa hàng loạt.
- Chưa có phụ huynh, tin nhắn SMS, thông báo đẩy, điểm danh bằng QR, hay thông báo theo thời gian thực. Dữ liệu tải lại sau thao tác hoặc nút Tải lại.
- Giao diện sơ đồ hiện chọn rồi bấm vị trí; chưa kéo thả.
- Kiểm thử tích hợp dùng adapter D1 trên SQLite thực; không thay thế kiểm thử tải production hoặc kiểm định nghiệp vụ của trường.

## Dữ liệu, sao lưu và triển khai

`db/schema.ts` là schema gốc. SQL và metadata trong `drizzle/` được quản lí theo phiên bản. Không sửa migration đã áp dụng. Khi thay schema:

```bash
pnpm db:generate
pnpm build
pnpm db:migrate:local
pnpm test
```

Local migration dùng bảng `local_migrations`, chỉ áp dụng migration chưa chạy. Lần cài mới phải chạy từ DB trống; không chạy lại script sau khi đã áp dụng SQL thủ công nếu chưa ghi nhận lịch sử tương ứng.

Production Sites tự áp dụng migration trong gói triển khai. `.openai/hosting.json` chứa Site ID và binding D1 `DB`; không chứa credential. Dữ liệu không lưu trong repo. Sao lưu D1 tại nền tảng triển khai; CSV chỉ là báo cáo, không phải bản sao lưu đầy đủ.

Đọc thêm [ARCHITECTURE.md](ARCHITECTURE.md) và [SECURITY.md](SECURITY.md).
