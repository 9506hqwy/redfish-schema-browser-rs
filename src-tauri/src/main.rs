#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::cmp::{Ord, Ordering, PartialEq, PartialOrd};
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::string::ToString;
use std::sync::Mutex;

static SCHEMA_MODELS: Lazy<Mutex<Vec<Model>>> = Lazy::new(|| Mutex::new(vec![]));

struct Model {
    resource: String,
    versions: Vec<ModelVersion>,
}

impl Model {
    fn find_default_version(&self) -> &ModelVersion {
        self.versions.iter().find(|v| v.name.is_none()).unwrap()
    }

    fn find_latest(&self) -> &ModelVersion {
        let mut versions = self
            .versions
            .iter()
            .filter_map(|v| v.name.as_ref())
            .collect::<Vec<&Version>>();
        versions.sort_by(|a, b| b.cmp(a));
        match versions.first() {
            Some(latest) => self
                .versions
                .iter()
                .filter(|v| v.name.is_some())
                .find(|v| v.name.as_ref().unwrap().eq(latest))
                .unwrap(),
            _ => self.find_default_version(),
        }
    }

    fn find_version(&self, version: &str) -> Option<&ModelVersion> {
        self.versions
            .iter()
            .filter(|v| v.name.is_some())
            .find(|v| v.name.as_ref().unwrap().to_string() == version)
    }
}

#[derive(Clone)]
struct ModelVersion {
    name: Option<Version>,
    path: String,
}

#[derive(Clone, Eq)]
struct Version {
    major: u8,
    minor: u8,
    patch: u8,
}

impl PartialEq for Version {
    fn eq(&self, other: &Self) -> bool {
        self.major == other.major && self.minor == other.minor && self.patch == other.patch
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        match self.major.cmp(&other.major) {
            Ordering::Less => Ordering::Less,
            Ordering::Greater => Ordering::Greater,
            Ordering::Equal => match self.minor.cmp(&other.minor) {
                Ordering::Less => Ordering::Less,
                Ordering::Greater => Ordering::Greater,
                Ordering::Equal => self.patch.cmp(&other.patch),
            },
        }
    }
}

impl FromStr for Version {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let mut v = s.strip_prefix('v').unwrap_or(s).split(&['_', '.']);

        let major = v.next().ok_or(format!("Not found major version: {}", s))?;
        let minor = v.next().ok_or(format!("Not found minor version: {}", s))?;
        let patch = v.next().ok_or(format!("Not found patch version: {}", s))?;

        let major = major
            .parse()
            .map_err(|_| format!("Invalid numner: {}", major))?;
        let minor = minor
            .parse()
            .map_err(|_| format!("Invalid numner: {}", minor))?;
        let patch = patch
            .parse()
            .map_err(|_| format!("Invalid numner: {}", patch))?;

        Ok(Version {
            major,
            minor,
            patch,
        })
    }
}

impl ToString for Version {
    fn to_string(&self) -> String {
        format!("v{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[derive(Clone, Deserialize, Serialize)]
struct RedfishModel {
    link: String,
    resource: String,
    version: String,
    fragment: String,
}

impl RedfishModel {
    fn from_resource(resource: &str) -> Self {
        let link = format!("http://redfish.dmtf.org/schemas/v1/{}.json", resource);
        let resource = resource.to_string();
        let version = "".to_string();
        let fragment = "".to_string();

        RedfishModel {
            link,
            resource,
            version,
            fragment,
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
struct SearchResourceResult {
    name: String,
    model: String,
    properties: Vec<SearchPropertyResult>,
}

#[derive(Clone, Deserialize, Serialize)]
struct SearchPropertyResult {
    name: String,
    value: Option<SearchValueResult>,
}

#[derive(Clone, Deserialize, Serialize)]
struct SearchValueResult {
    name: String,
    content: String,
}

struct CurrentPosition {
    models: Mutex<Vec<RedfishModel>>,
}

impl Default for CurrentPosition {
    fn default() -> Self {
        let models = vec![RedfishModel::from_resource("ServiceRoot")];

        CurrentPosition {
            models: Mutex::new(models),
        }
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let m = app.get_cli_matches()?;

            if let Some(schemadir) = m.args.get("schemadir") {
                if let Some(path) = schemadir.value.as_str() {
                    setup_models(path);
                }
            }

            Ok(())
        })
        .manage(CurrentPosition::default())
        .invoke_handler(tauri::generate_handler![
            get_current_position,
            get_schemas,
            get_schema_by_url,
            get_schema_content,
            get_schema_versions,
            reset_current_position,
            search,
            set_schema_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_current_position(pos: tauri::State<CurrentPosition>) -> Vec<RedfishModel> {
    pos.models.lock().unwrap().clone()
}

#[tauri::command]
fn get_schemas() -> Result<Vec<String>, String> {
    let models = SCHEMA_MODELS.lock().unwrap();
    let mut resources = models
        .iter()
        .map(|m| m.resource.clone())
        .collect::<Vec<String>>();
    resources.sort();
    Ok(resources)
}

#[tauri::command]
fn get_schema_by_url(
    link: String,
    pos: tauri::State<CurrentPosition>,
) -> Result<RedfishModel, String> {
    const PREFIX: &str = "/schemas/v1/";

    let link_url = url::Url::parse(&link).map_err(|_| format!("Invalid: {}", link))?;
    let path = link_url.path();

    if !path.starts_with(PREFIX) {
        return Err("Not match URL".to_string());
    }

    let resource = path
        .strip_prefix(PREFIX)
        .unwrap()
        .strip_suffix(".json")
        .unwrap();
    let versions = get_schema_versions(resource.to_string())?;

    let model = RedfishModel {
        link,
        resource: resource.to_string(),
        version: versions.first().cloned().unwrap_or_default(),
        fragment: link_url.fragment().unwrap_or_default().to_string(),
    };

    let mut models = pos.models.lock().unwrap();
    match models.iter().position(|m| m.resource == model.resource) {
        Some(index) => {
            while models.len() > (index + 1) {
                models.remove(index + 1);
            }
        }
        _ => {
            models.push(model.clone());
        }
    }

    Ok(model)
}

#[tauri::command]
fn get_schema_content(schema: String, version: String) -> Result<String, String> {
    let models = SCHEMA_MODELS.lock().unwrap();
    let model = models
        .iter()
        .find(|m| m.resource == schema)
        .ok_or(format!("Not found: {}", schema))?;
    let version = match model.find_version(&version) {
        Some(m) => m,
        _ => model.find_default_version(),
    };
    let path = Path::new(&version.path);

    match fs::read_to_string(path) {
        Ok(c) => Ok(c),
        _ => Err("failed to fs:read_to_string".to_string()),
    }
}

#[tauri::command]
fn get_schema_versions(schema: String) -> Result<Vec<String>, String> {
    let models = SCHEMA_MODELS.lock().unwrap();
    let model = models
        .iter()
        .find(|m| m.resource == schema)
        .ok_or(format!("Not found: {}", schema))?;
    let mut versions = model
        .versions
        .iter()
        .filter_map(|v| v.name.as_ref())
        .collect::<Vec<&Version>>();
    versions.sort_by(|a, b| b.cmp(a));
    Ok(versions.iter().map(|v| v.to_string()).collect())
}

#[tauri::command]
fn reset_current_position(schema: String, pos: tauri::State<CurrentPosition>) {
    let mut models = pos.models.lock().unwrap();
    models.clear();
    models.push(RedfishModel::from_resource(&schema));
}

#[tauri::command]
fn search(keyword: &str) -> Result<Vec<SearchResourceResult>, String> {
    let regex = Regex::new(&format!("(?i){}", keyword)).unwrap();
    search_by_keyword(&regex)
}

#[tauri::command]
fn set_schema_path(path: String) {
    setup_models(&path);
}

fn get_schema_files(dir: &str) -> Vec<PathBuf> {
    let entries = fs::read_dir(dir).unwrap();
    entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().unwrap().is_file())
        .map(|e| e.path())
        .collect()
}

fn get_schema_name(filename: &str) -> String {
    filename.split('.').next().unwrap().to_string()
}

fn get_schema_version(filename: &str) -> String {
    let version = filename.split('.');
    let count = version.clone().count() - 2;
    let version = version.skip(1).take(count).collect::<Vec<&str>>();
    version.as_slice().join(".")
}

fn is_schema(filename: &str) -> bool {
    filename.split('.').count() < 3
}

fn match_definition(
    definition: &serde_json::value::Value,
    keyword: &Regex,
) -> Vec<SearchPropertyResult> {
    let mut matches = vec![];

    if let serde_json::value::Value::Object(definition) = definition {
        if let Some(serde_json::value::Value::Object(properties)) = definition.get("properties") {
            for (name, property) in properties {
                if keyword.is_match(name) {
                    matches.push(SearchPropertyResult {
                        name: name.to_string(),
                        value: None,
                    });
                }

                if let Some(m) = match_property(property, keyword) {
                    matches.push(SearchPropertyResult {
                        name: name.to_string(),
                        value: Some(m),
                    });
                }
            }
        }
    }

    matches
}

fn match_property(
    property: &serde_json::value::Value,
    keyword: &Regex,
) -> Option<SearchValueResult> {
    if let serde_json::value::Value::Object(property) = property {
        if let Some(serde_json::value::Value::String(long_desc)) = property.get("longDescription") {
            if keyword.is_match(long_desc) {
                return Some(SearchValueResult {
                    name: "longDescription".to_string(),
                    content: long_desc.clone(),
                });
            }
        }

        if let Some(serde_json::value::Value::String(desc)) = property.get("description") {
            if keyword.is_match(desc) {
                return Some(SearchValueResult {
                    name: "description".to_string(),
                    content: desc.clone(),
                });
            }
        }
    }

    None
}

fn search_by_keyword(keyword: &Regex) -> Result<Vec<SearchResourceResult>, String> {
    let models = SCHEMA_MODELS.lock().unwrap();

    let mut matches = vec![];
    for model in models.iter() {
        let latest = model.find_latest();

        let path = Path::new(&latest.path);
        let content =
            fs::read_to_string(path).map_err(|_| "failed to fs:read_to_string".to_string())?;
        let json =
            serde_json::de::from_str(&content).map_err(|_| "failed to deserialize".to_string())?;

        if let serde_json::value::Value::Object(json) = json {
            if let Some(serde_json::value::Value::Object(definitions)) = json.get("definitions") {
                for (name, definition) in definitions {
                    let m = match_definition(definition, keyword);
                    if !m.is_empty() {
                        matches.push(SearchResourceResult {
                            name: model.resource.clone(),
                            model: name.clone(),
                            properties: m,
                        });
                    }
                }
            }
        }
    }

    Ok(matches)
}

fn setup_models(dir: &str) {
    let mut models = SCHEMA_MODELS.lock().unwrap();
    for path in get_schema_files(dir) {
        let file_name = path.file_name().unwrap().to_str().unwrap();

        let resource = get_schema_name(file_name);
        if !models.iter().any(|m| m.resource == resource) {
            let m = Model {
                resource: resource.clone(),
                versions: vec![],
            };
            models.push(m);
        }

        let name = if is_schema(file_name) {
            None
        } else {
            let v = get_schema_version(file_name);
            Some(Version::from_str(&v).unwrap_or_else(|_| panic!("Invalid: {}", file_name)))
        };
        let v = ModelVersion {
            name,
            path: path.into_os_string().into_string().unwrap(),
        };

        let model = models.iter_mut().find(|m| m.resource == resource).unwrap();
        model.versions.push(v);
    }
}
