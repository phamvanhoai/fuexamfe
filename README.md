# FUEXAMFE

Trang web tĩnh để import PDF text hoặc nhiều ảnh đề trắc nghiệm, tách câu hỏi bằng text/OCR, hiển thị từng câu theo dạng ảnh chụp đề và export câu hỏi ra TXT/PNG/JPG/ZIP/PDF.

Import ảnh sẽ thêm câu hỏi mới vào danh sách hiện tại. Có thể xóa câu hiện tại hoặc xóa toàn bộ danh sách trong panel dữ liệu.

Đổi `Tên file export` để rút gọn tên file tải xuống. File trong ZIP dùng dạng ngắn `ten_001.png`, `ten_002.png`.

Có thể sửa câu hỏi, sửa lựa chọn A/B/C/D, sửa đáp án hoặc thêm câu hỏi thủ công trong panel dữ liệu.

JavaScript đã được tách theo nhóm trong `assets/js/`; `assets/app.js` chỉ còn phần khởi tạo và nối sự kiện.

Import ảnh có thể dùng Google AI Studio/Gemini. Tạo file `.env` từ `.env.example`:

```env
GEMINI_API_KEY=your_google_ai_studio_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
IMPORT_ANSWER_MODE=keep
PDF_ENGINE=auto
IMAGE_ENGINE=gemini
```

`IMPORT_ANSWER_MODE` hỗ trợ `keep` (dùng đáp án có sẵn), `ai` (Gemini tự giải) hoặc `blank` (để trống).

Mở `index.html` trực tiếp hoặc chạy server local:

```powershell
php -S 127.0.0.1:8080
```

Để app tự đọc `.env`, nên chạy qua server local thay vì mở file HTML trực tiếp.
