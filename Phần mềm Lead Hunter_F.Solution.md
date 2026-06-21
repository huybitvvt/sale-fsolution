**PHẦN MỀM LEAD HUNTER \- NỘI BỘ CÔNG TY F-SOLUTION**

**Version 1.0**

**1\. Sơ đồ luồng nghiệp vụ**

**![][image1]**

# **BƯỚC 1\. QUÉT BÀI VIẾT TỪ FACEBOOK GROUP**

Hệ thống tự động vào các group Facebook mà F-Solution đã cấu hình để quét bài viết mới.

Hiện tại đang: User nhập URL → nhập từ khóa → bấm tải → quét bài viết → hiển thị list

\* Cải thiện: 5 phút/lần quét theo URL sẵn → quét bài mới → lấy hết bài → User lọc xem

# **BƯỚC 2\. THU THẬP & LƯU DỮ LIỆU**

Sau khi quét được bài viết → Hệ thống sẽ lưu dữ liệu vào database

**Ví dụ:** 

“Công ty mình cần phần mềm quản lý nhân sự bằng AppSheet, cần đơn vị triển khai gấp.”

**Hệ thống lưu:**

| Trường | Giá trị |
| ----- | ----- |
| Nội dung | Cần phần mềm quản lý nhân sự |
| Từ khóa | cần phần mềm |
| Nền tảng | AppSheet |
| Module nghiệp vụ | Bán hàng |
| Module ngành | Vận tải |

* List từ khóa: tôi cần, nhu cầu, cần hỗ trợ, cần xây dựng, cần tool, cần phần mềm, tìm đơn vị làm, tìm người làm 

* List lĩnh vực: 

  * App Sheet, Google Sheet, WebApp, Web, Phần mềm, Excel; 

  * Bán hàng, Khách hàng, CRM, Sale, Vận đơn, Quản lý đơn, Hàng hóa, Marketing, Kế toán, Thuế, Nhân sự, Chấm công, Kho, Thiết bị

  * Nông sản, Xuất nhập khẩu, Logistics, Vận tải, Kho bến, Mỹ phẩm, Xây dựng, Thời trang, Nhà hàng, …

# **BƯỚC 3\. AI ENGINE PHÂN TÍCH NHU CẦU**

Từ dữ liệu phân loại → đưa thông tin đầu vào hỏi A.I theo các câu hỏi cơ bản:

* Đây có phải khách hàng thật không?

* Có nhu cầu mua dịch vụ không?

* Họ đang cần gì? → map với List module sẵn có F-Solutions [Demo các module\_F-Solution](https://docs.google.com/spreadsheets/d/1fz5ylMMDdODLvTJfnMZDrrsN0DC7Aqa-4oxhz8NfPMM/edit?gid=0#gid=0) → map với List khóa trong bảng KEY [Tài nguyên Seeding](https://docs.google.com/spreadsheets/d/1NxzQYY044hZZPSo8sjrjZ3RP3rQvbbQmLKU5Dyl92L0/edit?gid=0#gid=0)

* Mức độ gấp như thế nào?

* Comment với KH gì và để lại CTA/contac gì?

Kết quả đầu ra

* Các thông tin nhóm 1 để Chấm điểm nóng Lead

* Nội dung comment để BOT trả lời tự động (Chỉ auto comment với Lead nóng và Lead rất nóng)

# **BƯỚC 4\. BOT COMMENT TỰ ĐỘNG**

Từ dữ liệu nội dung comment AI → BOT đăng comment bài viết

Quét phản hồi của khách hàng để cộng thông tin nhóm 2 để Chấm điểm nóng Lead

# **BƯỚC 5\. CHẤM ĐIỂM NÓNG LEAD**

Từ thông tin nhóm 1 → Hệ thống chấm điểm nóng Lead (ngay)

Từ thông tin nhóm 2 → Hệ thống cộng tăng điểm nóng Lead (bổ sung khi có thông tin)

| Điều kiện | Điểm |
| ----- | :---: |
| Có từ khóa nhu cầu (list từ khóa) | \+10 |
| Yêu cầu “báo giá” | \+20 |
| Có số điện thoại | \+30 |
| Có deadline | \+20 |
| Yêu cầu gấp | \+25 |
| Có ngân sách | \+25 |
| Giải pháp mà F-Solution có sẵn hoặc gần giống | \+30 |

Ví dụ thực tế bài viết

“Cần đơn vị làm AppSheet quản lý vận tải, triển khai trong tháng này, liên hệ 09xxxx.”

Hệ thống tính điểm

| Điều kiện | Điểm |
| ----- | :---: |
| Có từ “cần đơn vị” | \+10 |
| Có deadline | \+20 |
| Có số điện thoại | \+30 |
| F-Solution đã có sẵn | \+30 |

Tổng điểm \= 90  → Lead rất nóng

Thông tin nhóm 2: Khách hàng comment xác nhận (đúng rồi, OK, quan tâm, ib) thì cộng thêm \+40 điểm

# **BƯỚC 6\. ĐƯA VÀO BỂ LEAD TRONG CRM**

Sau khi xác định là Lead tiềm năng (\>10) → Hệ thống sẽ tự động tạo Lead trong CRM.

Dữ liệu Lead gồm các cột: Tên Facebook, Nội dung nhu cầu, Link bài viết, Group, Điểm chấm Lead, Trạng thái Lead, Sale phụ trách (chia lead)

Các trạng thái Lead: Lead mới (Chưa liên hệ), Đã liên hệ, Đang tư vấn, Đã demo, Đang báo giá, Chốt deal, Thất bại (ghi rõ lý do)

# **BƯỚC 7\. SALE TIẾP NHẬN VÀ CHĂM SÓC**

Khi có Lead nóng (\>60):

Hệ thống sẽ:

* Gửi thông báo Telegram/Zalo

* Sau 30 phút chưa chuyển trạng thái thì chuyển Sale phụ trách khác và báo Giám đốc

Sale thao tác trực tiếp trên CRM:

* Inbox Facebook

* Comment bài viết

* Gọi điện

* Gửi báo giá

* Cập nhật Trạng thái Lead trên CRM

Ví dụ lịch sử xử lý

| Thời gian | Hoạt động  | Trạng thái Lead |
| ----- | ----- | ----- |
| 09:00 | Lead được tạo | Lead mới |
| 09:05 | Sale gọi điện | Đã liên hệ |
| 14:15 | Khách yêu cầu demo | Đã demo |
| 16:00 | Đã gửi báo giá | Đang báo giá |

Hệ thống cảnh báo tự động

| Điều kiện | Cảnh báo | Người nhận cảnh báo |
| ----- | ----- | ----- |
| Lead ấm (\>10): 2 giờ chưa đổi trạng thái “Đã liên hệ” | Báo đỏ (Zalo) | Sale (Trực page) |
| Lead nóng (\>60): 30 phút chưa đổi trạng thái “Đã liên hệ” | Báo đỏ (Zalo) | Sale (Trực page), Giám đốc |
| 24 giờ chưa cập nhật trạng thái mới | Báo cam (Zalo) | Sale (Trực page) |

# **Dashboard Ban giám đốc có thể xem**

| KPI | Ý nghĩa |
| ----- | ----- |
| Số bài quét/ngày | Độ ổn định của hệ thống BOT quét |
| Số Lead mới | Khả năng tìm khách (tối ưu từ khóa) |
| Số Lead nóng, Tỷ lệ Lead nóng | Chất lượng Lead (tối ưu từ khóa, AI) |
| Tỷ lệ nhận diện đúng | Khả năng AI/BOT |
| Tỷ lệ spam | Khả năng AI/BOT |
| Tỷ lệ comment tự động | Khả năng AI/BOT |
| Tỷ lệ phản hồi | Hiệu quả Sale (hiệu suất sale, tối ưu kịch bản Sale) |
| Tỷ lệ demo | Hiệu quả Sale (hiệu suất sale, tối ưu kịch bản Sale) |
| Tỷ lệ báo giá | Hiệu quả Sale (hiệu suất sale, tối ưu kịch bản Sale) |
| Tỷ lệ chốt | Doanh thu (tối ưu kịch bản demo/giá/chốt) |
| Group hiệu quả nhất | Nguồn khách tốt nhất (tìm kiếm thêm group) |

**PHỤ LỤC**

# **PHÂN LOẠI MỨC ĐIỂM LEAD & HOẠT ĐỘNG XỬ LÝ**

Hệ thống Lead Hunter của F-Solution sẽ chia Lead thành nhiều cấp độ để:

* Ưu tiên xử lý đúng khách hàng

* Giảm spam Facebook

* Tối ưu hiệu suất Sale

* Tăng tỷ lệ chốt

# **I. PHÂN LOẠI MỨC ĐỘ LEAD**

| Mức điểm | Mức độ Lead | Ý nghĩa |
| ----- | ----- | ----- |
| 0 – 10 | Lead lạnh | Có tín hiệu nhẹ |
| 11 – 30 | Lead quan tâm | Có nhu cầu sơ bộ |
| 31 – 60 | Lead ấm | Có khả năng mua |
| 61 – 90 | Lead nóng | Nhu cầu rõ ràng |
| \>90 | Lead rất nóng | Khả năng chốt cao |

# **II. WORKFLOW THEO TỪNG MỨC LEAD**

# **1\. LEAD LẠNH (0 – 10 ĐIỂM)**

## **Đặc điểm**

* Chỉ có từ khóa nhẹ

* Chưa rõ nhu cầu thật

* Không có số điện thoại

* Không có deadline

* Nội dung còn chung chung

## **Ví dụ bài viết**

“Có ai biết AppSheet là gì không?”

# **Hoạt động hệ thống**

| Hoạt động | Thực hiện |
| ----- | ----- |
| Lưu bài viết | Có |
| Đưa Queue AI | Có |
| Chấm điểm | Có |
| Auto comment | Không |
| Tạo Lead CRM | Không |
| Gửi Sale | Không |

# **Mục tiêu**

* Chỉ lưu dữ liệu

* Theo dõi hành vi sau này

* Không spam khách hàng

# **2\. LEAD QUAN TÂM (11 – 30 ĐIỂM)**

## **Đặc điểm**

* Có nhu cầu sơ bộ

* Có từ khóa rõ hơn

* Chưa đủ nóng

* Chưa chắc mua

## **Ví dụ bài viết**

“Mình cần tìm hiểu phần mềm quản lý kho bằng Excel.”

# **Hoạt động hệ thống**

| Hoạt động | Thực hiện |
| ----- | ----- |
| Tạo Lead CRM | Có |
| Gắn tag “Lead Quan Tâm” | Có |
| AI sinh comment | Có |
| Auto comment | Không |
| Gợi ý Sale xử lý | Có |
| Gửi Telegram | Không |

# **Hành động khuyến nghị**

## **Sale nên:**

* Theo dõi

* Comment mềm

* Inbox nhẹ nhàng

* Gửi tài liệu/demo mẫu

# **Ví dụ comment**

“F-Solution đã từng triển khai giải pháp tương tự, anh/chị có thể tham khảo thêm nếu cần nhé.”

# **3\. LEAD ẤM (31 – 60 ĐIỂM)**

## **Đặc điểm**

* Nhu cầu khá rõ

* Có lĩnh vực cụ thể

* Có khả năng triển khai

* Có thể đang tìm vendor

## **Ví dụ bài viết**

“Cần đơn vị làm AppSheet quản lý vận tải.”

# **Hoạt động hệ thống**

| Hoạt động | Thực hiện |
| ----- | ----- |
| Tạo Lead CRM | Có |
| Auto assign Sale | Có |
| AI sinh comment | Có |
| Gợi ý Matching Solution | Có |
| Gửi Telegram | Có |
| Auto comment mềm | Có thể |

# **Hành động Sale**

## **Trong 2 giờ phải:**

* Inbox khách

* Comment bài viết

* Gọi điện nếu có số

# **Mục tiêu**

Chuyển Lead thành Demo

# **4\. LEAD NÓNG (61 – 90 ĐIỂM)**

## **Đặc điểm**

* Có nhu cầu thật

* Có deadline

* Có số điện thoại

* Đang cần gấp

* Có khả năng chốt cao

## **Ví dụ bài viết**

“Cần AppSheet quản lý kho triển khai trong tháng này, liên hệ 09xxxx.”

# **Hoạt động hệ thống**

| Hoạt động | Thực hiện |
| ----- | ----- |
| Tạo Lead CRM | Có |
| Gắn tag “Lead Nóng” | Có |
| Auto assign Sale ưu tiên | Có |
| Gửi Telegram | Có |
| Gửi Zalo | Có |
| Báo Giám đốc | Có |
| Auto comment | Có |
| SLA 30 phút | Có |

# **Hành động Sale**

## **Trong 30 phút phải:**

* Gọi điện

* Inbox

* Đặt lịch demo

* Cập nhật CRM

# **Nếu không xử lý**

Hệ thống:

* Báo đỏ

* Chuyển Sale khác

* Notify Giám đốc

# **Mục tiêu**

Demo \+ Báo giá

# **5\. LEAD RẤT NÓNG (\>90 ĐIỂM)**

## **Đặc điểm**

* Có nhu cầu rất rõ

* Có deadline gấp

* Có ngân sách

* Có số điện thoại

* Chủ động phản hồi

* Matching solution cao

## **Ví dụ bài viết**

“Cần triển khai CRM cho công ty trong tháng này, có ngân sách, liên hệ trực tiếp 09xxxx.”

# **Hoạt động hệ thống**

| Hoạt động | Thực hiện |
| ----- | ----- |
| Gắn tag “VIP Lead” | Có |
| Push Sale Senior | Có |
| Báo Giám đốc ngay | Có |
| SLA 15 phút | Có |
| Ưu tiên Dashboard | Có |
| Gợi ý Case Study | Có |
| Gợi ý Báo giá mẫu | Có |

# **Hành động Sale**

## **Ưu tiên cao nhất**

* Gọi ngay

* Chốt lịch demo

* Gửi hồ sơ năng lực

* Gửi case study

* Báo giá nhanh

# **Mục tiêu**

Chốt Deal

# **III. QUY TẮC TĂNG/GIẢM ĐIỂM ĐỘNG**

# **Tăng điểm**

| Hành động khách | Điểm |
| ----- | ----- |
| Comment phản hồi | \+40 |
| Inbox phản hồi | \+50 |
| Đồng ý demo | \+50 |
| Gửi yêu cầu chi tiết | \+30 |
| Cung cấp số điện thoại | \+30 |

# **Giảm điểm**

| Điều kiện | Điểm |
| ----- | ----- |
| Không phản hồi 7 ngày | \-20 |
| Từ chối tư vấn | \-50 |
| Spam / fake | \-100 |
| Lead trùng | Không cộng |

# **IV. SLA XỬ LÝ THEO MỨC LEAD**

| Mức Lead | Thời gian phản hồi |
| ----- | ----- |
| Lead quan tâm | 24 giờ |
| Lead ấm | 2 giờ |
| Lead nóng | 30 phút |
| Lead rất nóng | 15 phút |

# **V. MÀU HIỂN THỊ CRM**

| Mức Lead | Màu |
| ----- | ----- |
| Lead lạnh | Xám |
| Lead quan tâm | Xanh dương |
| Lead ấm | Vàng |
| Lead nóng | Cam |
| Lead rất nóng | Đỏ |

[image1]: <data:image/png;base64,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>