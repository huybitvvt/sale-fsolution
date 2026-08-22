# Seeding Fsolution Bridge

Extension này dùng để gửi bình luận TikTok, lấy cookie Facebook khi admin bấm nút trên web và hỗ trợ đăng lần lượt vào Facebook Group bằng chính phiên Chrome của nhân viên. Web không tự đọc cookie nền; extension chỉ trả cookie khi người dùng chủ động bấm.

## Cài đặt cho khách

1. Mở Chrome và vào `chrome://extensions`.
2. Bật `Developer mode`.
3. Chọn `Load unpacked`.
4. Chọn thư mục `browser-extension` trong source dự án.
5. Đăng nhập TikTok/Facebook trên Chrome.
6. Mở web Seeding Fsolution:
   - Vào `Lead` hoặc `TikTok CMT`, chọn video và bấm `Gửi CMT TikTok`.
   - Vào `Quản lý Cooki` -> thêm/sửa nhân sự -> bấm `Lấy từ Chrome` để lấy cookie Facebook.
   - Vào `TikTok CMT` -> `Một kênh`, dán `@username` hoặc link kênh. Extension sẽ mở kênh TikTok trong Chrome, cuộn trang để gom link video thật, rồi web mới đọc comment theo từng video.
   - Vào `Bài viết`, chọn các Facebook Group/Page rồi bấm `Đăng qua Chrome`. Extension mở lần lượt từng nơi, điền caption và tự chọn ảnh/video đã upload. Nhân viên kiểm tra preview, tự bấm `Đăng`; khi hộp soạn bài đóng, extension ghi nhận kết quả rồi chuyển sang nơi kế tiếp.

## Cập nhật extension

Khi source có thay đổi extension:

1. Mở `chrome://extensions`.
2. Bấm nút reload trên `Seeding Fsolution Bridge` hoặc bấm `Update`.
3. Đảm bảo version hiện tại là `0.1.47` trở lên.
4. Tải lại web Seeding Fsolution trước khi test lại `TikTok CMT`.

## Lưu ý vận hành

- Không cần dán cookie TikTok vào web để gửi comment.
- Lấy comment theo kênh TikTok cần extension đang bật, vì TikTok chỉ hiện đủ danh sách video sau khi Chrome render/scroll trang kênh.
- Khi bấm gửi TikTok từ UI, web sẽ thử gửi trực tiếp qua extension bằng tab TikTok đang đăng nhập. Nếu TikTok chặn/captcha/không nhận, web sẽ fallback sang copy nội dung và mở video để sale gửi thủ công.
- Khi trả lời TikTok từ Inbox, extension sẽ ưu tiên mở link `?comment=<cid>`, sau đó tự cuộn panel bình luận để tìm comment, tô xanh nếu thấy và ghim bảng xử lý. Chỉ cuộn trong panel comment, không cuộn feed video.
- Facebook cookie chỉ được lấy khi admin bấm nút, không tự động thu thập nền.
- Chế độ Facebook Group/Page tự bấm nút `Đăng` sau khi xác nhận caption, media preview và nút đăng đều sẵn sàng; extension chỉ chuyển sang nơi tiếp theo khi Facebook đã đóng hộp soạn bài.
- Bản 0.1.30 tự bỏ hàng đợi bị kẹt khi tab Facebook cũ đã đóng. Nếu hàng đợi cũ vẫn còn hoạt động, lần đăng mới sẽ hiện nút `Hủy hàng đợi cũ` để người dùng chủ động dừng rồi thử lại.
- Bản 0.1.31 bỏ qua an toàn bridge cũ bị Chrome vô hiệu hóa khi reload tiện ích, tránh ghi lỗi `Extension context invalidated`; sau khi reload extension vẫn cần tải lại các tab Sale F-Solution/Facebook đang mở.
- Bản 0.1.34 thêm module `facebook-profile-detector.js` độc lập với auto-comment. Module chỉ tìm SĐT Việt Nam trong vùng Thông tin liên hệ/Giới thiệu công khai của profile đang mở, ghi rõ nguồn và không quét/gán số trong bài viết. Nút **Lưu vào Lead** cần có ít nhất một tab F-Solution đang đăng nhập.
- Bản 0.1.35 tự theo dõi permalink mới từ lúc bấm Đăng, nhận link trong thông báo Facebook hoặc bài mới trên feed và chờ tối đa 15 giây để lấy Post ID. Nếu Facebook không công khai link, lịch sử vẫn có **Mở nơi đăng** và **Gắn link thủ công** làm phương án dự phòng.
- Bản 0.1.36 tự mở lại nơi đăng theo thứ tự mới nhất khi Facebook chưa trả permalink ngay, gắn link vào lịch sử và dùng tab nền đọc reaction/comment/share khi Graph API không có quyền Group.
- Bản 0.1.37 phát hiện trường hợp Graph API trả metrics rỗng và tự mở permalink bằng phiên Facebook trong Chrome để đọc reaction/comment/share cùng các comment đang hiển thị, sau đó lưu ngược về lịch sử.
- Bản 0.1.38 đối chiếu nội dung và Group trước khi chấp nhận permalink, từ chối link của bài khác và cho phép **Tìm lại link** với các bản ghi đã bị gắn nhầm trước đây.
- Bản 0.1.39 nhận diện permalink bài cá nhân dạng `pfbid...` và không cuộn khỏi bài đầu trong lúc chờ Facebook render link bài viết.
- Bản 0.1.40 nhận diện link bài dạng `/share/p/...` và cho phép dò caption ngắn bên trong khung kết quả tìm kiếm mà không cuộn qua bài đúng.
- Bản 0.1.41 nhận diện chính xác bài viết đang chờ phê duyệt/kiểm duyệt trong Group, không báo nhầm là "Đã đăng" và từ chối các URL thuộc `my_pending_content`.
- Bản 0.1.45 chuẩn hóa nội dung bài viết và nhận diện đầy đủ link tìm kiếm (`multi_permalinks`, `story_fbid=pfbid`, `permalink.php`, `/share/`), bắt link ngay tại bài đầu tiên trên kết quả tìm kiếm mà không cuộn trôi qua bài.
- Bản 0.1.46 bắt permalink/Post ID ngay trong phản hồi GraphQL khi đăng, dùng DOM làm dự phòng, lưu từng kết quả về backend trước khi chuyển nơi tiếp theo; Group chỉ đọc tương tác/comment trực tiếp qua extension.
- Bản 0.1.47 chỉ nhận phản hồi đúng mutation tạo bài, ưu tiên trạng thái chờ duyệt, bắt buộc Group và caption phải khớp trước khi đọc tương tác/comment, đồng thời cho phép gỡ permalink bị gắn sai.
- Bản 0.1.32 kiểm tra caption trên mọi editor hiện tại và chuẩn hóa ký tự ẩn/khoảng trắng do Facebook Lexical tạo ra, tránh dừng nhầm với lỗi `Không xác nhận được caption` nhưng vẫn chặn caption thiếu hoặc bị nhân đôi.
- Bản 0.1.33 chờ và cuộn nhẹ qua phần ảnh bìa Group để Facebook tải vùng thảo luận trước khi tìm ô tạo bài, đồng thời nhận thêm các nhãn composer mới nhưng vẫn loại trừ ô bình luận.
- Caption và file ảnh/video công khai đã upload trên màn `Bài viết` được điền/chọn tự động. Extension chỉ thao tác trong dialog `Tạo bài viết`, không dùng ô bình luận làm phương án dự phòng, ưu tiên paste tương thích Facebook Lexical và không chèn lại caption khi nhận retry. Bản 0.1.29 tự bấm `Đăng` sau khi xác nhận caption, preview media và nút đăng đều sẵn sàng, rồi chuyển sang nơi tiếp theo sau khi dialog đóng. Nút `Hủy hàng đợi` trên lịch sử sẽ dừng các nơi chưa xử lý. Extension sẽ dừng và báo lỗi nếu Facebook chặn, không xác nhận, hoặc không tải/gắn được media.
- Link YouTube/TikTok hoặc URL không trỏ trực tiếp tới file media được chèn vào caption để Facebook tạo link preview, không được tải thành file.
- Nếu TikTok hỏi đăng nhập lại, hãy đăng nhập trực tiếp trên tab TikTok rồi bấm gửi lại.
- Extension chỉ gửi khi người dùng bấm nút, không có chế độ tự spam hoặc chạy nền hàng loạt.
