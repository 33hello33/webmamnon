-- Mẫu phiếu lương mới cho schema truongtrong.tbl_luong
--
-- Việc migration sẽ:
--   1. Gom 6 loại ngày công vào 1 cột jsonb: chitiet_ngaycong
--      { thucte, nghiphep_nam, nghile_tet, nghiviec_rieng, nghiom, nghikhongphep }
--   2. Thêm các cột thu nhập / khấu trừ mới của mẫu phiếu lương
--   3. Xoá các cột cũ không còn dùng
--
-- Cách chạy: Supabase Dashboard > SQL Editor > dán toàn bộ file này > Run

-- 1. Cột jsonb chứa chi tiết ngày công
alter table truongtrong.tbl_luong
   add column if not exists chitiet_ngaycong jsonb default '{}'::jsonb;

-- 2. Chuyển dữ liệu ngày công của schema cũ (ngaycong / ngaynghiphep) vào cột json trước khi xoá cột
do $$
begin
   if exists (
      select 1 from information_schema.columns
      where table_schema = 'truongtrong' and table_name = 'tbl_luong' and column_name = 'ngaycong'
   ) then
      if exists (
         select 1 from information_schema.columns
         where table_schema = 'truongtrong' and table_name = 'tbl_luong' and column_name = 'ngaynghiphep'
      ) then
         update truongtrong.tbl_luong
            set chitiet_ngaycong = jsonb_build_object(
                  'thucte', coalesce(ngaycong, 0),
                  'nghiphep_nam', coalesce(ngaynghiphep, 0)
               )
            where chitiet_ngaycong is null or chitiet_ngaycong = '{}'::jsonb;
      else
         update truongtrong.tbl_luong
            set chitiet_ngaycong = jsonb_build_object('thucte', coalesce(ngaycong, 0))
            where chitiet_ngaycong is null or chitiet_ngaycong = '{}'::jsonb;
      end if;
   end if;
end $$;

-- 3. Các cột mới của mẫu phiếu lương
alter table truongtrong.tbl_luong
   add column if not exists luong_nghiphep bigint default 0,
   add column if not exists hotro_sinhnhat bigint default 0,
   add column if not exists thuong_hocvien bigint default 0,
   add column if not exists hotro_kidscamp bigint default 0,
   add column if not exists luong_bhxh bigint default 0,
   add column if not exists thue_tncn bigint default 0,
   add column if not exists ghichu_trukhoac text;

-- 4. Xoá các cột cũ không còn dùng
alter table truongtrong.tbl_luong
   drop column if exists chuyencan,
   drop column if exists phucap_bhxh,
   drop column if exists phucap_trachnhiem,
   drop column if exists phucap_dilai,
   drop column if exists phucap_chuyenmon,
   drop column if exists phucap_khac,
   drop column if exists thuongle,
   drop column if exists tangluong,
   drop column if exists tamung,
   drop column if exists phucap_kidscamp,
   drop column if exists khautru_khac2,
   drop column if exists phucap_khac2,
   drop column if exists ngaycong,
   drop column if exists ngaynghiphep;

-- Nạp lại schema cache của PostgREST để API nhận cấu trúc mới
notify pgrst, 'reload schema';
