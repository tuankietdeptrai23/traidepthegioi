# traidepthegioi

## Lớp Học Hay

Ứng dụng quản lí lớp học tiếng Việt. Mã nguồn nằm trong [`lop-hoc-hay/`](./lop-hoc-hay/).

- [Hướng dẫn cài đặt, tính năng và giới hạn](./lop-hoc-hay/README.md)
- [Kiến trúc](./lop-hoc-hay/ARCHITECTURE.md)
- [Bảo mật](./lop-hoc-hay/SECURITY.md)
- [Mở bản web riêng tư](https://lop-hoc-hay-dain.dainvietlach.chatgpt.site/)

```bash
cd lop-hoc-hay
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate:local
pnpm dev
```

Yêu cầu Node.js 24.22+ và pnpm 11.25+. Đăng nhập production sử dụng ChatGPT qua Sites. Dữ liệu D1 không nằm trong kho mã.

Bản nguồn đã qua kiểm tra TypeScript, build production và 28 kiểm tra tích hợp. GitHub Actions sẽ kiểm tra lại mỗi lần push hoặc mở pull request.
