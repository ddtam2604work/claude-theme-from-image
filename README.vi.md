# claude-image-theme

[English](README.md) · **Tiếng Việt**

Biến một tấm ảnh bất kỳ thành mod theme cho Claude (Claude Code trên ứng dụng desktop và mobile).
Chỉ cần đưa vào một ảnh, công cụ sẽ:

1. **Trích bảng màu chủ đạo** từ ảnh (thuật toán k-means).
2. **Phối màu hài hòa**: nền trang, thẻ, khung chat nhuộm theo tông màu chính của ảnh; chữ dễ đọc; màu nhấn (accent), thành công, cảnh báo, lỗi, pro vẫn giữ đúng ý nghĩa (đỏ, xanh lá, vàng cam) nhưng ngả theo màu ảnh.
3. **Dùng ảnh làm hình nền.** Theme không nhúng được ảnh bitmap, nên ảnh được vẽ lại bằng vector sát với ảnh gốc: một lớp nền mượt (làm mờ) giữ các dải chuyển màu, và khoảng 5.000 ô nhỏ chỉ thêm chi tiết ở nơi ảnh có đường nét (hành tinh, bóng người, tinh vân). Các điểm sáng trong ảnh thành sao lấp lánh chậm.
4. **Phủ một lớp mờ** lên ảnh (tối ở chế độ tối, sáng ở chế độ sáng) và **khung kính mờ** có viền sáng, để chữ trong khung chat luôn dễ đọc.
5. **Kiểm tra độ tương phản** bằng chính bộ dựng màu của hệ thống thiết kế, tự chỉnh màu cho đến khi ứng dụng chấp nhận theme.
6. **Thêm bảng điều chỉnh** để chỉnh trực tiếp: lớp phủ, kính mờ, độ nhòe, độ nét ảnh, màu nhấn, chế độ, sao, ảnh trôi và viền. Lựa chọn được lưu cho lần sau.

Kết quả là một thư mục mod sẵn sàng nạp: bảng màu, khung chat, viền, nút và chữ đều theo ảnh của bạn, giống các theme không gian tự tạo trong Antigravity.

![Hình nền ví dụ tạo từ samples/nebula.png](samples/nebula-preview.svg)

## Yêu cầu

- Node.js 18 trở lên
- Claude Code có hỗ trợ mod (plugin hooks). Theme hiển thị trên ứng dụng **desktop** và **mobile**; terminal không vẽ theme.

## Bắt đầu nhanh

```bash
git clone https://github.com/ddtam2604work/claude-theme-from-image.git
cd claude-theme-from-image
npm install
node bin/generate.mjs "C:\Users\<ten-ban>\Pictures\space.jpg" --name space --lang vi
```

Kết quả in ra:

```
Palette: #000b0e 31%, #001e2b 28%, #00362a 21%, #012852 6%, ...
  dark  text-primary on surface-0 16.8:1, text-muted on surface-0 8.8:1
Scene: 320x180 grid, 5650 cells, 108855 characters
Mod written to: ~/.claude/image-themes/image-theme-space
```

Sau đó nạp mod:

```bash
claude --plugin-dir ~/.claude/image-themes/image-theme-space
```

Với phiên do ứng dụng desktop khởi chạy, thêm thư mục vào biến `CLAUDE_CODE_PLUGIN_DIRS` (trong biến môi trường, hoặc khối `env` của `~/.claude/settings.json`):

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<ten-ban>\\.claude\\image-themes\\image-theme-space" } }
```

Mở file `preview.svg` trong thư mục mod bằng trình duyệt để xem trước hình nền.

### Dùng thử theme mẫu

Repo này cũng là một marketplace plugin, có sẵn theme mẫu **Nebula** tạo từ `samples/nebula.png` (ảnh tự vẽ bằng thuật toán, không dùng tác phẩm của bên thứ ba). Gõ tại dấu nhắc của phiên Claude Code:

```
/plugin install image-theme-nebula --marketplace ddtam2604work/claude-theme-from-image
```

hoặc từ shell:

```bash
claude plugin install image-theme-nebula --marketplace ddtam2604work/claude-theme-from-image
```

## Bảng điều chỉnh

Gõ lệnh của mod (ví dụ `/image-theme-space`) để mở bảng điều chỉnh bên cạnh khung chat:

| Mục | Tác dụng |
| --- | --- |
| Bật / Tắt | Bật hoặc tắt theme |
| Lớp phủ tối trên ảnh | Độ tối lớp phủ, 0–95 % (− / + mỗi bước 5 %) |
| Lớp phủ sáng | Lớp phủ ở chế độ sáng |
| Độ đục kính của khung | Khung kính mờ đặc hay trong |
| Độ nhòe sau khung | 0–64 |
| Độ nét ảnh nền | Sắc nét, Vừa hoặc Mềm |
| Màu nhấn | Theo ảnh, hoặc chọn một màu nổi bật trong ảnh |
| Chế độ | Theo ứng dụng, luôn tối, hoặc luôn sáng |
| Sao lấp lánh, Ảnh trôi chậm, Viền sáng | Bật / tắt |
| Mặc định | Trở về giá trị ban đầu |

Thay đổi áp dụng ngay và được lưu cho các phiên sau. `/image-theme-space off` và `/image-theme-space on` tắt / bật theme ngay từ dấu nhắc.

## Tùy chọn của công cụ

| Tùy chọn | Mặc định | Tác dụng |
| --- | --- | --- |
| `--name <slug>` | tên file | Mã theme; mod có tên `image-theme-<slug>` |
| `--label <chữ>` | từ name | Tên hiển thị trong ứng dụng |
| `--out <thư mục>` | `~/.claude/image-themes` | Nơi ghi thư mục mod |
| `--lang en\|vi` | `en` | Ngôn ngữ của bảng điều chỉnh |
| `--mode both\|dark\|light` | `both` | Tạo cả hai chế độ màu, hoặc chỉ một |
| `--detail <160..480>` | `320` | Độ phân giải của ảnh vẽ lại |
| `--colors <32..200>` | `120` | Số màu trong ảnh vẽ lại |
| `--stars <n>` | `120` | Số điểm sáng giữ lại làm sao |
| `--veil`, `--veil-light`, `--glass`, `--blur`, `--softness`, `--still` | | Giá trị ban đầu của bảng điều chỉnh |

Mẹo:
- Ảnh nhiều chi tiết hoặc quá sáng, chữ khó đọc? Tăng lớp phủ hoặc độ đục kính trong bảng điều chỉnh.
- Ảnh vũ trụ tối thường đẹp nhất với `--mode dark`.
- Cảnh nền phải nhỏ hơn 131.072 ký tự, nên công cụ dồn dung lượng vào những vùng ảnh nhiều chi tiết nhất.

## Cách hoạt động

```
ảnh ─► lưới 320×180 ─► quadtree: ô nhỏ chỉ ở nơi có đường nét ───────┐
    └► lưới 64×36 ──► lớp nền mượt (làm mờ) ─────────────────────────┼─► mẫu cảnh SVG
    └► điểm sáng ──► sao lấp lánh ────────────────────────────────────┘        │
    └► bảng màu k-means ─► tông chính, màu nhấn ─► makeColors() (kiểm tra tương phản)
                                                        │                       │
                     bảng điều chỉnh ($.state + $.store) ─► $.theme.set({ colors, backdrop })
```

| File | Vai trò |
| --- | --- |
| `bin/generate.mjs` | Dòng lệnh: đọc ảnh, ghi mod |
| `lib/image.mjs` | Giải mã JPEG/PNG, lấy trung bình lưới, tìm điểm sáng, k-means |
| `lib/theme.mjs` | Phân tích bảng màu và định nghĩa theme (nền, chữ, màu vai trò, các màu nhấn) |
| `lib/scene.mjs` | Hình nền vector: lớp nền, ô chi tiết, lớp phủ, sao |
| `lib/color.mjs` | Tính toán màu và độ tương phản WCAG |
| `template/hooks/register.tsx` | Phần mod: đặt theme, vẽ hình nền, bảng điều chỉnh và lệnh |
| `template/types/index.d.ts` | Kiểu dữ liệu cài đặt mà bảng điều chỉnh lưu |
| `template/tests/settings.test.tsx` | Kiểm thử bảng điều chỉnh (`claude plugin test <mod>`) |
| `template/hooks/make-colors.js` | Bộ dựng màu của hệ thống thiết kế, lấy từ bộ công cụ viết mod của Claude Code |
| `mods/image-theme-nebula` | Mod mẫu đã tạo sẵn |

Mỗi mod tạo ra có file `hooks/look.generated.ts` chứa bảng màu, định nghĩa màu, cài đặt mặc định và cảnh SVG. Hãy chạy lại công cụ thay vì sửa tay.

## Giới hạn

- Theme chỉ hiển thị trên ứng dụng desktop và mobile.
- Hình nền là bản vẽ lại bằng vector, không phải ảnh gốc: chi tiết rất nhỏ sẽ mềm đi.
- `make-colors.js` theo phiên bản Claude Code mà nó được lấy ra. Sau bản cập nhật lớn của Claude Code, hãy lấy bản mới từ bộ công cụ viết mod rồi tạo lại theme.
- Chỉ dùng ảnh mà bạn có quyền sử dụng.

## Giấy phép

MIT
