use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageDeviceType {
    LocalDisk,
    UsbDrive,
    MtpDevice,
    NetworkDrive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageDevice {
    pub id: String,
    pub label: String,
    pub device_type: StorageDeviceType,
    pub root_path: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub is_removable: bool,
    pub icon_hint: String,
    pub is_ready: bool,
}

#[cfg(windows)]
mod win_api {
    #[link(name = "kernel32")]
    extern "system" {
        pub fn GetLogicalDrives() -> u32;
        pub fn GetDriveTypeW(lpRootPathName: *const u16) -> u32;
        pub fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
        pub fn GetVolumeInformationW(
            lpRootPathName: *const u16,
            lpVolumeNameBuffer: *mut u16,
            nVolumeNameSize: u32,
            lpVolumeSerialNumber: *mut u32,
            lpMaximumComponentLength: *mut u32,
            lpFileSystemFlags: *mut u32,
            lpFileSystemNameBuffer: *mut u16,
            nFileSystemNameSize: u32,
        ) -> i32;
    }

    pub const DRIVE_REMOVABLE: u32 = 2;
    pub const DRIVE_FIXED: u32 = 3;
    pub const DRIVE_REMOTE: u32 = 4;
}

/// T017: Detecta dispositivos MTP/portátiles conectados usando COM IPortableDeviceManager.
/// Si COM o WPD fallan, registra warning y devuelve Vec::new() sin afectar discos normales.
#[cfg(windows)]
pub fn detect_mtp_devices() -> Vec<StorageDevice> {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Devices::PortableDevices::{IPortableDeviceManager, PortableDeviceManager};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };

    let mut mtp_devices = Vec::new();

    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() {
            eprintln!("[SpaceLens] Warning: CoInitializeEx falló al detectar MTP: {:?}", hr);
        }

        let manager: IPortableDeviceManager =
            match CoCreateInstance(&PortableDeviceManager, None, CLSCTX_INPROC_SERVER) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!(
                        "[SpaceLens] Warning: No se pudo crear IPortableDeviceManager: {:?}",
                        e
                    );
                    return Vec::new();
                }
            };

        let mut count: u32 = 0;
        if let Err(e) = manager.GetDevices(std::ptr::null_mut(), &mut count) {
            eprintln!("[SpaceLens] Warning: GetDevices(count) falló: {:?}", e);
            return Vec::new();
        }

        if count == 0 {
            return Vec::new();
        }

        let mut device_ids: Vec<PWSTR> = vec![PWSTR::null(); count as usize];
        if let Err(e) = manager.GetDevices(device_ids.as_mut_ptr(), &mut count) {
            eprintln!("[SpaceLens] Warning: GetDevices(ids) falló: {:?}", e);
            return Vec::new();
        }

        for i in 0..(count as usize) {
            let pnp_id_pwstr = device_ids[i];
            if pnp_id_pwstr.is_null() {
                continue;
            }

            let pnp_id_pcwstr = PCWSTR(pnp_id_pwstr.0);
            let id_str = pnp_id_pwstr.to_string().unwrap_or_else(|_| format!("mtp_{}", i));

            // Obtener longitud del nombre amigable
            let mut name_len: u32 = 0;
            let _ = manager.GetDeviceFriendlyName(pnp_id_pcwstr, PWSTR::null(), &mut name_len);

            let friendly_name = if name_len > 0 {
                let mut name_buf = vec![0u16; name_len as usize];
                if manager
                    .GetDeviceFriendlyName(
                        pnp_id_pcwstr,
                        PWSTR(name_buf.as_mut_ptr()),
                        &mut name_len,
                    )
                    .is_ok()
                {
                    let end = name_buf.iter().position(|&c| c == 0).unwrap_or(name_buf.len());
                    String::from_utf16_lossy(&name_buf[..end])
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let label = if !friendly_name.trim().is_empty() {
                friendly_name.trim().to_string()
            } else {
                let mut desc_len: u32 = 0;
                let _ = manager.GetDeviceDescription(pnp_id_pcwstr, PWSTR::null(), &mut desc_len);
                if desc_len > 0 {
                    let mut desc_buf = vec![0u16; desc_len as usize];
                    if manager
                        .GetDeviceDescription(
                            pnp_id_pcwstr,
                            PWSTR(desc_buf.as_mut_ptr()),
                            &mut desc_len,
                        )
                        .is_ok()
                    {
                        let end = desc_buf.iter().position(|&c| c == 0).unwrap_or(desc_buf.len());
                        let s = String::from_utf16_lossy(&desc_buf[..end]);
                        if !s.trim().is_empty() {
                            s.trim().to_string()
                        } else {
                            format!("Dispositivo MTP ({})", i + 1)
                        }
                    } else {
                        format!("Dispositivo MTP ({})", i + 1)
                    }
                } else {
                    format!("Dispositivo MTP ({})", i + 1)
                }
            };

            mtp_devices.push(StorageDevice {
                id: format!("mtp://{}", id_str),
                label,
                device_type: StorageDeviceType::MtpDevice,
                root_path: format!("mtp://{}", id_str),
                total_bytes: 0,
                used_bytes: 0,
                free_bytes: 0,
                is_removable: true,
                icon_hint: "phone".to_string(),
                is_ready: false,
            });

            CoTaskMemFree(Some(pnp_id_pwstr.0 as *const _));
        }
    }

    mtp_devices
}

#[cfg(not(windows))]
pub fn detect_mtp_devices() -> Vec<StorageDevice> {
    Vec::new()
}

#[tauri::command]
pub fn list_storage_devices() -> Vec<StorageDevice> {
    let mut devices = Vec::new();

    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let bitmask = unsafe { win_api::GetLogicalDrives() };

        for i in 0..26 {
            if (bitmask & (1 << i)) != 0 {
                let drive_letter = (b'A' + i as u8) as char;
                let root_path = format!("{}:\\", drive_letter);
                let wide_path: Vec<u16> = OsStr::new(&root_path)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();

                let drive_type = unsafe { win_api::GetDriveTypeW(wide_path.as_ptr()) };

                // Solo incluir fijos, removibles o remotos
                if drive_type == win_api::DRIVE_FIXED
                    || drive_type == win_api::DRIVE_REMOVABLE
                    || drive_type == win_api::DRIVE_REMOTE
                {
                    let mut free_bytes_avail: u64 = 0;
                    let mut total_bytes: u64 = 0;
                    let mut total_free_bytes: u64 = 0;

                    let space_ok = unsafe {
                        win_api::GetDiskFreeSpaceExW(
                            wide_path.as_ptr(),
                            &mut free_bytes_avail,
                            &mut total_bytes,
                            &mut total_free_bytes,
                        )
                    };

                    if space_ok != 0 && total_bytes > 0 {
                        let used_bytes = total_bytes.saturating_sub(total_free_bytes);

                        let mut vol_name = [0u16; 260];
                        let mut fs_name = [0u16; 260];
                        let mut serial: u32 = 0;
                        let mut max_comp: u32 = 0;
                        let mut flags: u32 = 0;

                        let vol_ok = unsafe {
                            win_api::GetVolumeInformationW(
                                wide_path.as_ptr(),
                                vol_name.as_mut_ptr(),
                                vol_name.len() as u32,
                                &mut serial,
                                &mut max_comp,
                                &mut flags,
                                fs_name.as_mut_ptr(),
                                fs_name.len() as u32,
                            )
                        };

                        let volume_label = if vol_ok != 0 {
                            let len = vol_name.iter().position(|&c| c == 0).unwrap_or(0);
                            String::from_utf16_lossy(&vol_name[..len])
                        } else {
                            String::new()
                        };

                        let (dev_type, is_removable, icon_hint, default_prefix) =
                            if drive_type == win_api::DRIVE_REMOVABLE {
                                (StorageDeviceType::UsbDrive, true, "usb", "Unidad USB")
                            } else if drive_type == win_api::DRIVE_REMOTE {
                                (StorageDeviceType::NetworkDrive, false, "network", "Unidad de Red")
                            } else {
                                (StorageDeviceType::LocalDisk, false, "hard_drive", "Disco Local")
                            };

                        let label = if !volume_label.trim().is_empty() {
                            format!("{} ({}:)", volume_label.trim(), drive_letter)
                        } else {
                            format!("{} ({}:)", default_prefix, drive_letter)
                        };

                        devices.push(StorageDevice {
                            id: format!("{}:", drive_letter),
                            label,
                            device_type: dev_type,
                            root_path,
                            total_bytes,
                            used_bytes,
                            free_bytes: total_free_bytes,
                            is_removable,
                            icon_hint: icon_hint.to_string(),
                            is_ready: true,
                        });
                    }
                }
            }
        }

        // T017: Concatenar dispositivos MTP detectados vía WPD COM
        let mtp = detect_mtp_devices();
        devices.extend(mtp);
    }

    #[cfg(not(windows))]
    {
        devices.push(StorageDevice {
            id: "root".to_string(),
            label: "Disco del Sistema (/)".to_string(),
            device_type: StorageDeviceType::LocalDisk,
            root_path: "/".to_string(),
            total_bytes: 1_000_000_000_000,
            used_bytes: 500_000_000_000,
            free_bytes: 500_000_000_000,
            is_removable: false,
            icon_hint: "hard_drive".to_string(),
            is_ready: true,
        });
    }

    devices
}
