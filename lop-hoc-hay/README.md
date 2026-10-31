# Lớp Học Hay — tài khoản do admin cấp

Ứng dụng tiếng Việt quản lí nhiều lớp: thi đua theo tổ, vi phạm / rèn luyện, học tập, quỹ lớp, phong trào, trực nhật và sơ đồ lớp.

## Đăng nhập

- Mọi người sử dụng **ID và mật khẩu**, không cần email hay tài khoản ChatGPT.
- Chỉ admin cấp tài khoản; không có đăng kí tự do hoặc mật khẩu mặc định.
- ID dài 3–40 ký tự, gồm chữ Latin không dấu, số, dấu chấm, `_`, `-`, không phân biệt hoa thường.
- Mật khẩu từ 8–128 ký tự, băm bằng PBKDF2-SHA256 / 100.000 vòng và salt ngẫu nhiên riêng từng tài khoản.
- Đăng nhập được nhớ **90 ngày** bằng cookie HttpOnly, Secure (HTTPS), SameSite=Lax. Không lưu mật khẩu trong trình duyệt hoặc localStorage.
- Đăng xuất, khóa tài khoản hoặc đổi / đặt lại mật khẩu sẽ hủy các phiên liên quan. Tài khoản được kiểm tra lại trên từng yêu cầu.
- Giới hạn số lần đăng nhập sai theo ID/IP trong cửa sổ 15 phút; báo lỗi chung không tiết lộ tài khoản tồn tại hay không.

### Chủ sở hữu thiết lập lần đầu

Dữ liệu cũ được giữ. Chủ sở hữu đã được lưu trong `settings.owner`.

1. Mở web. Nếu chưa có ID quản trị, chọn **Bạn là chủ sở hữu website? → Thiết lập quản trị lần đầu**.
2. Xác thực đúng tài khoản ChatGPT của chủ sở hữu đã lưu (chỉ dùng một lần cho bước khởi tạo này).
3. Tự chọn ID và mật khẩu quản trị. Sau đó mọi lần đăng nhập dùng ID này.

Người lạ không được nhận quyền admin bằng cách đăng nhập đầu tiên. Khi chủ sở hữu đã có mật khẩu, đường thiết lập này không cấp quyền đăng nhập qua ChatGPT nữa. Không có endpoint tạo admin công khai. Với một cài đặt hoàn toàn mới, người vận hành phải khởi tạo bản ghi chủ sở hữu và user admin đáng tin cậy trong cơ sở dữ liệu trước; không tự đặt chủ sở hữu theo người truy cập đầu tiên.

### Admin cấp và xếp lớp

1. Admin tạo lớp và cấp tài khoản giáo viên. Giáo viên hoặc admin mở **Thành viên lớp → Nhập danh sách lớp**, dán họ tên (có thể kèm STT và giới tính). ID tự tạo từ tên viết liền không dấu; trùng tên thêm số 2, 3… Mật khẩu học sinh ban đầu là **12345678**. Có thể tải danh sách ID sau khi nhập.
2. Ngoài nhập hàng loạt, admin vẫn có thể cấp từng tài khoản bằng **Quản trị hệ thống → Cấp tài khoản**, tự chọn ID/mật khẩu.
2. Có thể chọn **Lớp / tổ** ngay khi cấp tài khoản học sinh.
3. Tài khoản giáo viên được chọn làm giáo viên phụ trách khi tạo / cập nhật lớp.
4. Để xếp lớp sau hoặc đặt lại mật khẩu, bấm **Quản lí / Xếp lớp** ở tài khoản tương ứng. Để trống mật khẩu nếu muốn giữ nguyên.
5. Giáo viên kéo thả học sinh vào sơ đồ chỗ ngồi để tự xếp tổ theo vùng cột, sau đó bổ nhiệm cán sự. Trên điện thoại có thể chạm tên rồi chạm chỗ ngồi. Chuyển tổ sẽ gỡ chức vụ tổ trưởng của người được chuyển để tránh hai tổ trưởng trùng tổ. Học sinh đăng nhập sẽ thấy lớp của mình.

Bản triển khai được mở công khai ở cấp đường dẫn. Dữ liệu bên trong vẫn yêu cầu tài khoản hợp lệ và kiểm tra quyền trên máy chủ.

## Chạy mã nguồn

Yêu cầu Node.js **24.22+**, pnpm 11.25+.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate:local
pnpm dev
```

Mở URL lệnh dev in ra. Trong môi trường Sites được quản lí, dùng `sites-preview start <đường-dẫn-dự-án>` theo công cụ preview.

```bash
pnpm check
pnpm test
pnpm build
```

44 kiểm tra tích hợp hiện bao phủ nghiệp vụ, phân quyền, đăng nhập ID, băm mật khẩu, phiên 90 ngày, thu hồi phiên, chống đoán mật khẩu và giới hạn thiết lập admin.

## Công nghệ

React 19 / TypeScript, Next.js App Router chạy qua Vinext, Cloudflare Workers, Drizzle ORM, Cloudflare D1. Không sử dụng Supabase/PostgreSQL trong bản này. Không cần dịch vụ email để cấp tài khoản. Sites chỉ xác thực chủ sở hữu lúc thiết lập quản trị lần đầu; người dùng thông thường sử dụng phiên do ứng dụng quản lí.

Schema D1 có 19 bảng. Các trường tên cũ `users.email`, `students.email` và `classes.teacher_email` được giữ làm **khóa tài khoản nội bộ** để không mất liên kết dữ liệu; tên trường này không buộc giá trị phải là địa chỉ email. `users.login_id` là ID đăng nhập người dùng thấy. Các mã đăng nhập mới có thể là `hs12a2.01`, `gv.toan`, `admin.kiet`.

## Tính năng

- Admin xem toàn bộ lớp, cấp / khóa tài khoản, đặt lại mật khẩu, xếp học sinh vào lớp/tổ, phân công giáo viên.
- Giáo viên chỉ quản lí lớp được giao; bổ nhiệm cán sự, đổi tổ, chỉnh sơ đồ và quy tắc điểm.
- Tổ trưởng báo cáo tổ mình; lớp trưởng / lớp phó học tập / nề nếp báo cáo lớp theo quyền.
- Ghi nhận → gửi báo cáo → giáo viên duyệt hoặc trả lại → chốt tuần. Tuần đã chốt giữ nguyên dữ liệu và công thức.
- Quy tắc cộng/trừ, điểm chuẩn, thưởng tổ, tổng/trung bình, số tuần đề xuất khen thưởng và lịch trực tùy chỉnh theo lớp.
- Sự việc giữ tổ tại thời điểm ghi nhận; ảnh chụp tuần lưu thành viên và điểm lịch sử.
- Đồng điểm đồng hạng; các tổ đồng điểm cuối cùng cùng nhận lịch trực theo cấu hình.
- Chốt tuần sinh lịch trực chống trùng. Có tùy chọn thêm một lượt / học sinh vi phạm / tuần; ưu tiên nam đổ rác luân phiên theo tuần. Giáo viên bổ sung lịch, cán sự xác nhận.
- Đánh giá rèn luyện tháng, học kì, cả năm lưu riêng, có lý do và lịch sử. Hệ thống không tự hạ rèn luyện.
- Học sinh gửi đính chính; cán sự gửi nhận xét để giáo viên xử lí.
- Sổ điểm tự ghi, điểm giáo viên xác nhận, điểm từ báo cáo tổ được phân biệt. Sổ tự ghi chỉ người tạo xem, không giả thành điểm chính thức.
- Thu chi, đóng quỹ cá nhân, chứng từ HTTPS, duyệt giao dịch và điều chỉnh bằng giao dịch ngược chiều. Đóng quỹ người khác được ẩn với học sinh.
- Phong trào: đăng kí, giáo viên xác nhận thành viên và cộng điểm một lần.
- Sơ đồ chỗ ngồi, thông báo, xuất CSV mở trong Excel, in / lưu PDF và nhật kí thao tác.

## Nhập danh sách và bảng thi đua

Chọn file Excel `.xlsx` hoặc CSV/TSV để đọc danh sách **ngay trên thiết bị**, hoặc dán danh sách từ Excel có STT, Họ tên, Giới tính. Không cần tài khoản/email có sẵn. Web đọc tối đa 8 MB, dò tiêu đề cột và chọn trang tính có nhiều họ tên hợp lệ nhất; xem trước trước khi cấp tài khoản. File Excel `.xls` cũ cần lưu thành `.xlsx`. Không gửi nguyên file lên máy chủ, chỉ gửi các dòng được xác nhận khi tạo tài khoản. Ví dụ:

| Họ tên | Giới tính |
|---|---|
| Nguyễn Văn An | Nam |
| Trần Ngọc Mai | Nữ |

Tự cấp `nguyenvanan`, `tranngocmai`, mật khẩu `12345678`. Nếu ID đã có thì thêm số; tối đa 200 học sinh/lượt giao diện và chia lô 20 để lưu. Mỗi lô nguyên tử; nếu lô sau lỗi, giao diện báo số đã nhập để bỏ các dòng đã lưu trước khi thử lại. Danh sách dài có thể tải CSV tài khoản sau khi hoàn tất. Học sinh được nhắc đổi mật khẩu ban đầu và có thể đổi ở nút cài đặt cạnh hồ sơ.

**Thi đua → Bảng thi đua tổ** có chế độ xem toàn bộ tổ và chế độ nhập dành cho cán sự/giáo viên. Mỗi ô là số lần của một quy tắc: đi trễ, nghỉ học, không thuộc bài, KTBC 8/9/10… Điểm tự tính theo cấu hình lớp. Tổ trưởng chỉ nhập tổ mình. Học sinh thường không có quyền sửa giao diện lẫn API. Dữ liệu chưa duyệt chỉ được hiển thị trong phạm vi cán sự phụ trách; bảng chung hiển thị số lần và điểm đã duyệt, không lộ ghi chú hay minh chứng riêng.

Thay số lần trong bảng thay thế ghi nhận cũ bằng bản ghi mới, không cộng chồng. Tổ đã gửi báo cáo phải được giáo viên trả lại trước khi sửa. Chốt tuần khóa bảng. KTBC có thể ghi môn để điểm được đưa vào sổ môn cá nhân sau khi duyệt.

Bảng điểm cá nhân theo môn tách điểm tự ghi, giáo viên xác nhận và báo cáo tổ. Bình quân hiển thị chỉ là tham khảo từ các điểm đang ghi, chưa áp dụng hệ số học kì.

## Migration, dữ liệu và bảo mật

Thêm schema trong `db/schema.ts`, chạy `pnpm db:generate`, build và áp dụng local migration trước khi thử. Không sửa migration đã áp dụng. Production Sites áp dụng migration từ gói triển khai.

Dữ liệu không nằm trong Git. Giữ bản sao lưu D1 tại nền tảng triển khai; CSV không phải bản sao lưu đầy đủ. Các thay đổi lớp được bảo vệ bởi revision và batch nguyên tử để tránh chốt kết quả sai khi cập nhật đồng thời.

Giới hạn hiện tại: chưa có miễn giảm riêng theo từng học sinh/đợt thu, chưa đồng bộ phần mềm nhà trường, chưa có thông báo đẩy. Số liệu thu chi cần đối chiếu với chứng từ và tiền thực tế. Sơ đồ hỗ trợ kéo thả và thao tác chạm trên điện thoại. Xem [SECURITY.md](SECURITY.md), [ARCHITECTURE.md](ARCHITECTURE.md).

### Lớp học trực tuyến

Mỗi tài khoản đang hoạt động có thể tạo nhóm học, mời bằng liên kết và vào lại phòng đã tham gia. Giới hạn 8 người đồng thời để phù hợp gọi WebRTC dạng mesh. Không có thời lượng tự kết thúc; chủ phòng kết thúc thủ công. Đây không phải cam kết băng thông, lưu trữ hoặc hạ tầng miễn phí vô hạn.

- Mic/camera tắt khi vào; bật theo thao tác và quyền thiết bị của người dùng. Có giơ tay, chat, khóa lời mời, đổi link và kết thúc phòng.
- Chia sẻ tab, cửa sổ ứng dụng hoặc màn hình qua bộ chọn của trình duyệt, tùy chọn kèm âm thanh. Nguồn âm thanh phụ thuộc trình duyệt/hệ điều hành; nên dùng Chrome/Edge máy tính và chọn tab có bật âm thanh. Chỉ hoạt động đầy đủ trên HTTPS.
- Bảng trắng chung đồng bộ khi nhấc bút, có tẩy, hoàn tác nét của mình, xuất PNG; chủ phòng được dọn bảng.
- Máy tính khoa học với bố cục tham khảo 580/880: DEG/RAD, lượng giác, tổ hợp, giai thừa, phương trình bậc hai, hệ hai ẩn, thống kê và lịch sử cục bộ. Không phải giả lập Casio chính thức và không mô phỏng toàn bộ chức năng máy thật.
- Đồng hồ tập trung 25/5 riêng từng người, không ảnh hưởng cuộc gọi. Avatar emoji hoặc ảnh được thu nhỏ 160×160 và lưu qua API có xác thực.

**Kết nối mạng:** mặc định dùng STUN Cloudflare và truyền media trực tiếp giữa thiết bị; một số mạng NAT/firewall không kết nối được nếu thiếu TURN. Muốn có relay, cấu hình bí mật runtime `STUDY_TURN_KEY_ID` và `STUDY_TURN_API_TOKEN` từ Cloudflare Realtime TURN. API cấp ICE tạm thời 24 giờ cho phiên trong phòng; frontend làm mới mỗi 6 giờ. Có thể phát sinh phí nhà cung cấp; dự án không tự mua hoặc provision TURN. Chưa kiểm thử gọi qua các mạng NAT khác nhau hay relay production. Không tích hợp Zoom/Google Meet, không ghi hình cuộc gọi.


## Bảng thi đua trên điện thoại và KPI phát biểu

Trên màn hình nhỏ, **Bảng thi đua tổ** hiển thị từng học sinh theo thẻ, cùng một danh sách chọn quy tắc. Chọn quy tắc rồi nhập lần lượt cho cả tổ, chuyển sang quy tắc khác mà không làm mất các ô chưa lưu; bấm **Lưu** để ghi. Trên máy tính vẫn dùng bảng Excel có cột học sinh cố định.

Trong **Cấu hình → Danh mục cộng / trừ điểm**, giáo viên có thể kéo thả quy tắc trên máy tính hoặc dùng mũi tên lên/xuống trên điện thoại để đổi thứ tự cột, sau đó lưu cấu hình. Nút **Bật KPI phát biểu** thay các quy tắc phát biểu cũ bằng một cột tổng phát biểu/tuần. Lịch sử tuần đã chốt không thay đổi.

Mặc định KPI: từ **0 đến 3** lần ghi nhận trừ **5** điểm và đánh dấu vi phạm **Không đủ KPI**; từ **4 đến 7** lần không cộng/trừ; từ **8 đến 11** lần cộng **5** điểm; từ **12** lần cộng **10** điểm. Giáo viên được tự thay số lần tối thiểu, mức trừ, thêm/xóa các mốc cộng và số điểm. Một học sinh chỉ được **một mốc thưởng cao nhất**, không cộng dồn các mốc. Chưa nhập ô KPI sẽ không tự phạt; nhập số **0** sẽ ghi nhận không phát biểu và áp dụng mức trừ. Bảng nhập thay thế ghi nhận cũ cùng quy tắc, không cộng chồng. Điểm chỉ trở thành chính thức sau khi giáo viên duyệt báo cáo; tuần đã chốt bất biến.

### Kiểm tra bổ sung sau PR #2

- Giữ nguyên điểm kiểm tra `0` khi API nhận số, bắt buộc môn học cho ghi nhận học tập và có tra cứu điểm 0 / không thuộc bài theo môn, tên học sinh và trạng thái. Không tự coi mọi ghi nhận dưới 5 là điểm 0; dữ liệu cũ thiếu môn có bộ lọc riêng.
- Lớp trưởng và lớp phó học tập được duyệt hoặc trả lại báo cáo đang chờ với lý do. Chốt tuần và sửa quy tắc vẫn thuộc giáo viên / admin.
- Sắp xếp cột dùng API hoán vị ID, không ghi đè điểm hay quy tắc từ snapshot cũ. Tuần đã chốt giữ bố cục lịch sử. Có kéo thả trên máy tính và chọn vị trí bất kỳ trên điện thoại.
- Phòng học toàn cửa sổ giữ chia sẻ màn hình, chế độ thư viện, bảng công cụ và zoom 100–300% theo bước 25%.

Kiểm tra: 64 kiểm tra tích hợp và 7 kiểm tra nhập danh sách; TypeScript và build production. UI được kiểm tra trên dữ liệu giả (gồm khung điện thoại 390 px), nguồn màn hình minh họa, duyệt/trả báo cáo và lưu theo từng môn. Cuộc gọi media thực giữa hai thiết bị, chia sẻ âm thanh và TURN chưa được xác minh trong môi trường trình duyệt kiểm thử. Không thay đổi schema/migration hay dữ liệu production trong lượt nâng cấp này.

### Nhập điểm học tập bằng bảng Excel và mốc thuộc bài

Chọn tổ, môn học và lượt kiểm tra (1–5 trong tuần), rồi nhập trực tiếp điểm 0–10 cho học sinh. Điểm 0 được lưu như điểm thật; ô trống là chưa ghi nhận. Có dán cột Điểm (kèm Ghi chú nếu cần) từ Excel và Enter / mũi tên để chuyển dòng. Các cột Thuộc bài, Không thuộc bài và Cộng/trừ thi đua được tính tự động; học sinh thường chỉ xem điểm của mình.

Giáo viên/admin chỉnh mốc trong Cài đặt lớp → Mốc điểm thuộc bài. Các mốc tăng dần từ 0, phân loại thuộc/không thuộc và có mức điểm cộng/trừ riêng. Hệ thống áp dụng một mốc cao nhất phù hợp, không cộng dồn. Khi lớp chưa cấu hình mốc riêng, mốc 0/5/8/9/10 tham chiếu mức điểm các quy tắc hiện có (không có quy tắc thì 0 điểm thi đua). Đổi cấu hình không tự tính lại điểm đã ghi trước đó.

Dữ liệu dùng bảng entries hiện có với ruleId có tiền tố `academic-sheet/<lượt>/`; không có migration hay reset dữ liệu. Sửa/xóa ô đánh dấu bản cũ rejected và giữ lịch sử. Môn, lượt và tổ khác không bị ghi đè; ghi nhận số lần trong bảng cũ được giữ riêng để tránh thao tác sửa ô thay mất điểm môn học. Giáo viên/cán sự vẫn duyệt báo cáo; tuần đã chốt và báo cáo đã gửi khóa nhập như trước. Xem trước tạm tính dùng delta của các ghi nhận để bao gồm cả điểm từ bảng môn học.

Kiểm tra: 71 kiểm tra tích hợp và 7 kiểm tra nhập danh sách. Bao gồm ranh giới mốc, 0/ô trống/số thập phân, dữ liệu dán, quyền theo tổ/lớp, lưu từng môn/lượt, sửa/xóa giữ lịch sử, cấu hình không đổi điểm cũ và khóa theo báo cáo/tuần. UI thử bằng dữ liệu giả: nhập sáu mức điểm, tự phân cột, dán nhiều dòng, Enter chuyển dòng và giáo viên thay mốc.

### Bảng thi đua chung trên điện thoại và laptop

Toàn bộ quy tắc được nhập trực tiếp trên cùng bảng Excel dùng để xem thi đua, không chuyển sang thẻ nhập riêng trên điện thoại. Bảng có tên học sinh cố định bên trái, cuộn ngang, lọc nhóm cột, Enter / mũi tên chuyển dòng, dán vùng số lần từ Excel và lưu theo lô. Khi một lô lỗi, các ô đã lưu được gỡ khỏi nháp để lần thử tiếp theo không gửi lại chúng. Chế độ xem chung 4 tổ không có ô chỉnh sửa. Điểm kiểm tra 0–10 có bảng theo môn và mốc thuộc bài riêng ở ngay cùng trang, tránh nhầm điểm kiểm tra với số lần vi phạm.

Giáo viên chốt tuần sau khi đủ báo cáo được duyệt: kết quả và lịch trực tuần sau được lưu trong cùng giao dịch. Giao diện có dự kiến lịch dựa trên điểm đã duyệt. Bộ phân công bảo đảm đủ Quét lớp, Lau bảng, Lau bàn, Đổ rác kể cả tổ ít người; luân phiên vị trí, ưu tiên nam đổ rác nếu cấu hình, thêm một lượt cho học sinh có vi phạm đã duyệt và loại người đã lưu trữ khỏi phân công mới. Lịch cũ, tuần đã chốt và tài khoản không bị đặt lại.

Kiểm tra cuối: 73 kiểm tra tích hợp + 7 kiểm tra danh sách; TypeScript và build production. Có kiểm tra vùng dán, số 0 KPI/ô trống, công thức không hợp lệ, phạm vi tổ/môn, phân công đủ nhiệm vụ, ưu tiên đổ rác, loại học sinh lưu trữ, khóa tuần và chống tạo lịch trùng. UI thử ở khung điện thoại 390 px: tổ trưởng dán/lưu vùng 2×2 và chuyển sang xem 4 tổ không còn input.

## Nâng cấp quỹ lớp, báo cáo, phong trào và lịch trực

- Giáo viên/thủ quỹ tạo các đợt thu: tên, lý do, định mức từng học sinh, hạn thu và thông báo lên bảng tin.
- Thủ quỹ lọc theo tổ hoặc tên, tick học sinh đã nộp, ghi nhận tiền một phần hoặc nhiều lần. Mỗi lần xác nhận tạo bút toán sổ quỹ độc lập.
- Thu/chi được ghi ngay bởi người có quyền thủ quỹ, điều chỉnh có bút toán ngược (không xóa lịch sử) và audit.
- Số dư = tổng thu đã ghi sổ trừ tổng chi đã ghi sổ. Mọi người chỉ được xem các khoản đóng thuộc phạm vi được phép.
- Báo cáo thi đua .xlsx nhiều trang có xếp hạng (cả tổ cuối), học sinh, vi phạm, ghi nhận, lịch trực và thu chi theo quyền.
- Giáo viên nhập TKB theo thứ và môn. Lịch trực xếp những ngày có học: Trực lớp tối đa 4, Đổ rác 1, Lau bảng 1; ban cán sự được miễn, mỗi người không quá 1 việc mỗi ngày.
- Lượt vi phạm đã duyệt tạo lượt trực tương ứng. Khi thiếu người, tổ cuối hỗ trợ; khi giáo viên xếp tay, lịch tự động không chiếm thêm suất vượt định mức.
- Phong trào có thống kê, bộ lọc, quyền sửa/hủy hoạt động cho cán sự phụ trách; giáo viên giữ quyền chốt hoàn thành và cộng điểm.
- **Migration bắt buộc khi triển khai:** `0005_fund_collections.sql` thêm bảng `fund_collections` và cột `funds.collection_id`. Sao lưu D1 và áp dụng migration trước khi đưa bản mới lên production. GitHub merge không tự đồng bộ ChatGPT Sites.
