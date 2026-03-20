# Link4m Key Demo

Bộ source này để test luồng:

1. Frontend gọi `POST /api/create-link`
2. Server gọi API Link4m để tạo short link
3. User vượt link xong sẽ quay về `GET /verify`
4. Server đánh dấu `verified = true`
5. Frontend gọi `POST /api/get-key`
6. Chỉ khi verify thành công thì server mới tạo key random

## Cấu trúc file

| File | Vai trò |
|---|---|
| `server.js` | API Express + static web |
| `public/index.html` | Giao diện test |
| `render.yaml` | Cấu hình deploy Render |
| `.env.example` | Mẫu biến môi trường |

## Chạy local

```bash
npm install
cp .env.example .env
# sửa LINK4M_API_TOKEN trong .env
npm start
```

Mở trình duyệt tại:

```text
http://localhost:3000
```

## Deploy lên GitHub và Render

### 1) Push repo lên GitHub

```bash
git init
git add .
git commit -m "first deploy"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

### 2) Tạo Web Service trên Render

- Chọn repo GitHub này
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

### 3) Thêm Environment Variables trên Render

| Key | Giá trị |
|---|---|
| `LINK4M_API_TOKEN` | token Link4m mới của bạn |
| `APP_BASE_URL` | URL app trên Render, ví dụ `https://ten-app.onrender.com` |
| `SESSION_TTL_MINUTES` | `30` |

## API nhanh

| Method | URL | Mô tả |
|---|---|---|
| `POST` | `/api/create-link` | Tạo short link Link4m |
| `GET` | `/verify` | Nhận redirect sau khi user vượt link |
| `POST` | `/api/get-key` | Lấy key random nếu đã verify |
| `GET` | `/health` | Kiểm tra app còn sống |

## Lưu ý quan trọng

- Đừng nhét API token vào `index.html`
- Token bạn đã gửi công khai trước đó nên đổi sang token mới trước khi deploy
- Bản này lưu session trong RAM nên phù hợp để test nhanh
- Muốn chạy lâu dài thì nên thay `Map()` bằng database như Redis, SQLite, PostgreSQL hoặc MySQL
