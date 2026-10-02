use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use tempfile::TempDir;

use gigacare_core::scanner::browsers::{
    dir_size, parse_firefox_ini, scan_browser_caches, scan_chromium_profiles,
    scan_firefox_profiles,
};

fn create_dummy_file(path: &Path, size_bytes: usize) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    let mut file = File::create(path).unwrap();
    file.write_all(&vec![b'x'; size_bytes]).unwrap();
}

#[test]
fn test_chrome_structure_simulation() {
    let temp_dir = TempDir::new().unwrap();
    let user_data = temp_dir.path().join("User Data");
    let default_profile = user_data.join("Default");

    // Crear subdirectorios de caché estándar de Chromium
    let cache_dir = default_profile.join("Cache_Data");
    let code_cache_dir = default_profile.join("Code Cache");
    let gpu_cache_dir = default_profile.join("GPUCache");
    let service_worker_dir = default_profile.join("Service Worker");

    create_dummy_file(&cache_dir.join("data_0"), 1024);
    create_dummy_file(&cache_dir.join("data_1"), 2048);
    create_dummy_file(&code_cache_dir.join("js").join("index"), 4096);
    create_dummy_file(&gpu_cache_dir.join("gpu_data"), 512);
    create_dummy_file(&service_worker_dir.join("sw_cache"), 1024);

    let profiles = scan_chromium_profiles(&user_data);
    assert_eq!(profiles.len(), 1);

    let p = &profiles[0];
    assert_eq!(p.profile_name, "Default");
    assert_eq!(p.cache_entries.len(), 4);

    let cache_entry = p.cache_entries.iter().find(|e| e.cache_type == "cache").unwrap();
    assert_eq!(cache_entry.size_bytes, 3072);
    assert!(cache_entry.safe);

    let code_cache_entry = p.cache_entries.iter().find(|e| e.cache_type == "code_cache").unwrap();
    assert_eq!(code_cache_entry.size_bytes, 4096);
    assert!(code_cache_entry.safe);

    let gpu_cache_entry = p.cache_entries.iter().find(|e| e.cache_type == "gpu_cache").unwrap();
    assert_eq!(gpu_cache_entry.size_bytes, 512);
    assert!(gpu_cache_entry.safe);

    let sw_entry = p.cache_entries.iter().find(|e| e.cache_type == "service_worker").unwrap();
    assert_eq!(sw_entry.size_bytes, 1024);
    assert!(sw_entry.safe);

    assert_eq!(p.total_size_bytes, 3072 + 4096 + 512 + 1024);
}

#[test]
fn test_chrome_multiple_profiles() {
    let temp_dir = TempDir::new().unwrap();
    let user_data = temp_dir.path().join("User Data");

    create_dummy_file(&user_data.join("Default").join("Cache_Data").join("f1"), 100);
    create_dummy_file(&user_data.join("Profile 1").join("GPUCache").join("f2"), 200);
    create_dummy_file(&user_data.join("Profile 2").join("Code Cache").join("f3"), 300);

    let profiles = scan_chromium_profiles(&user_data);
    assert_eq!(profiles.len(), 3);
    assert_eq!(profiles[0].profile_name, "Default");
}

#[test]
fn test_firefox_structure_simulation_with_profiles_ini() {
    let temp_dir = TempDir::new().unwrap();
    let ff_dir = temp_dir.path().join("Firefox");
    let profiles_dir = ff_dir.join("Profiles");
    fs::create_dir_all(&profiles_dir).unwrap();

    // 2 perfiles: uno relativo y uno con ruta personalizada
    let prof1 = profiles_dir.join("abcdefgh.default-release");
    let prof2 = profiles_dir.join("12345678.work-profile");

    create_dummy_file(&prof1.join("cache2").join("entries").join("c1"), 5000);
    create_dummy_file(&prof1.join("shader-cache").join("s1"), 1000);
    create_dummy_file(&prof2.join("cache2").join("entries").join("c2"), 8000);
    create_dummy_file(&prof2.join("shader-cache").join("s2"), 2000);

    let ini_content = "[Profile0]\nName=default-release\nIsRelative=1\nPath=Profiles/abcdefgh.default-release\n\n[Profile1]\nName=work-profile\nIsRelative=1\nPath=Profiles/12345678.work-profile\n";
    fs::write(ff_dir.join("profiles.ini"), ini_content).unwrap();

    let profiles = scan_firefox_profiles(&profiles_dir);
    assert_eq!(profiles.len(), 2);

    let p1 = profiles.iter().find(|p| p.profile_name == "default-release").unwrap();
    assert_eq!(p1.total_size_bytes, 6000);
    assert_eq!(p1.cache_entries.len(), 2);

    let p2 = profiles.iter().find(|p| p.profile_name == "work-profile").unwrap();
    assert_eq!(p2.total_size_bytes, 10000);
    assert_eq!(p2.cache_entries.len(), 2);
}

#[test]
fn test_dir_size_calculations() {
    let temp_dir = TempDir::new().unwrap();
    let dir = temp_dir.path().join("sizes");
    create_dummy_file(&dir.join("sub1").join("a"), 100);
    create_dummy_file(&dir.join("sub2").join("b"), 200);
    create_dummy_file(&dir.join("sub2").join("deep").join("c"), 300);

    assert_eq!(dir_size(&dir), 600);
}

#[test]
fn test_empty_and_nonexistent_directories() {
    let temp_dir = TempDir::new().unwrap();
    let empty = temp_dir.path().join("empty");
    fs::create_dir(&empty).unwrap();

    assert_eq!(dir_size(&empty), 0);
    assert!(scan_chromium_profiles(&empty).is_empty());
    assert!(scan_firefox_profiles(&empty).is_empty());

    let non_existent = temp_dir.path().join("does_not_exist_123");
    assert_eq!(dir_size(&non_existent), 0);
    assert!(scan_chromium_profiles(&non_existent).is_empty());
    assert!(scan_firefox_profiles(&non_existent).is_empty());
}

#[test]
fn test_parse_firefox_ini_variations() {
    let temp_dir = TempDir::new().unwrap();
    let ini_path = temp_dir.path().join("profiles.ini");

    // Vacío
    fs::write(&ini_path, "").unwrap();
    assert!(parse_firefox_ini(&ini_path).is_empty());

    // Con múltiples perfiles y flags IsRelative distintos
    let content = "[General]\nStartWithLastProfile=1\n\n[Profile0]\nName=default\nIsRelative=1\nPath=Profiles/default\n\n[Profile1]\nName=custom\nIsRelative=0\nPath=C:/custom/profile\n";
    fs::write(&ini_path, content).unwrap();
    let parsed = parse_firefox_ini(&ini_path);
    assert_eq!(parsed.len(), 2);
    assert_eq!(parsed[0].0, "default");
    assert_eq!(parsed[1].0, "custom");
    assert_eq!(parsed[1].1, std::path::PathBuf::from("C:/custom/profile"));
}

#[test]
fn test_scan_browser_caches_real_system() {
    // Verifica que scan_browser_caches() se ejecuta en el sistema real sin pánico
    let results = scan_browser_caches();
    assert_eq!(results.len(), 6); // Chrome, Edge, Brave, Opera, Vivaldi, Firefox
    let ids: Vec<&str> = results.iter().map(|b| b.browser_id.as_str()).collect();
    assert!(ids.contains(&"chrome"));
    assert!(ids.contains(&"edge"));
    assert!(ids.contains(&"brave"));
    assert!(ids.contains(&"opera"));
    assert!(ids.contains(&"vivaldi"));
    assert!(ids.contains(&"firefox"));
}