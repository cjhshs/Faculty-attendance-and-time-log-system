; Faculty Attendance and Time Log System - Production Windows Installer
; Build the package first with scripts\windows\Build-Package.ps1.
; The installer never contains database or application secrets. Values entered
; in the wizard are written to a temporary secure file, consumed by the setup script,
; and deleted immediately.

#define AppName "Faculty Attendance and Time Log System"
#define AppShortName "FacultyAttendance"
#define AppVersion "1.0.0"
#define AppPublisher "Ramon Magsaysay Memorial Colleges, Inc."
#define AppIdGuid "600B8AEA-0913-4CAE-A52E-E9AA0B652231"

[Setup]
AppId={{600B8AEA-0913-4CAE-A52E-E9AA0B652231}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\FacultyAttendance
DefaultGroupName={#AppName}
DisableProgramGroupPage=no
OutputDir=..\deployment
OutputBaseFilename=Faculty-Attendance-Installer
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
UsePreviousAppDir=yes
CloseApplications=yes
RestartApplications=no
AllowNoIcons=yes
SetupLogging=yes
UninstallDisplayName={#AppName}
VersionInfoVersion=1.0.0.0

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\FacultyAttendance\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\scripts\windows\FacultyAttendanceManager.bat"
Name: "{group}\Control Panel & Manager"; Filename: "{app}\scripts\windows\FacultyAttendanceManager.bat"
Name: "{group}\Open System in Browser"; Filename: "http://localhost:3000/"
Name: "{group}\Backup Database"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\windows\Backup-Database.ps1"""
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Faculty Attendance Control Panel"; Filename: "{app}\scripts\windows\FacultyAttendanceManager.bat"; Tasks: desktopicon
Name: "{autodesktop}\Faculty Attendance Web"; Filename: "http://localhost:3000/"; Tasks: desktopicon

[Code]
var
  DbPage: TInputQueryWizardPage;
  AppPage: TInputQueryWizardPage;
  OptionPage: TInputOptionWizardPage;
  IsUpgrade: Boolean;
  InstalledVersion: String;

function InitializeSetup(): Boolean;
var
  InstallKey: String;
begin
  Result := True;
  IsUpgrade := False;
  InstallKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppIdGuid}_is1';
  if RegQueryStringValue(HKLM, InstallKey, 'DisplayVersion', InstalledVersion) then
  begin
    IsUpgrade := True;
  end;
end;

function IsSimpleName(const S: String): Boolean;
var
  I: Integer;
  C: Char;
begin
  Result := False;
  if S = '' then Exit;
  C := S[1];
  if not ((C >= 'A') and (C <= 'Z')) and not ((C >= 'a') and (C <= 'z')) and (C <> '_') then Exit;
  for I := 2 to Length(S) do
  begin
    C := S[I];
    if not ((C >= 'A') and (C <= 'Z')) and
       not ((C >= 'a') and (C <= 'z')) and
       not ((C >= '0') and (C <= '9')) and (C <> '_') then Exit;
  end;
  Result := True;
end;

function ValidPort(const S: String): Boolean;
var
  N: Integer;
begin
  N := StrToIntDef(S, -1);
  Result := (N >= 1) and (N <= 65535);
end;

function BoolJson(const B: Boolean): String;
begin
  if B then Result := 'true' else Result := 'false';
end;

function JsonEscape(const S: String): String;
var
  I: Integer;
  C: Char;
begin
  Result := '';
  for I := 1 to Length(S) do
  begin
    C := S[I];
    if C = '"' then Result := Result + '\"'
    else if C = '\' then Result := Result + '\\'
    else if C = #8 then Result := Result + '\b'
    else if C = #9 then Result := Result + '\t'
    else if C = #10 then Result := Result + '\n'
    else if C = #12 then Result := Result + '\f'
    else if C = #13 then Result := Result + '\r'
    else Result := Result + C;
  end;
end;

procedure InitializeWizard;
begin
  DbPage := CreateInputQueryPage(
    wpSelectDir,
    'Database Connection',
    'Enter PostgreSQL database connection details.',
    'The installer connects to PostgreSQL, creates a pre-install backup if the database exists, and runs migrations safely without destroying records.'
  );
  DbPage.Add('Database Host:', False);
  DbPage.Add('Port:', False);
  DbPage.Add('Database Name:', False);
  DbPage.Add('Database User:', False);
  DbPage.Add('Password:', True);
  DbPage.Add('PostgreSQL bin folder (optional / auto-detected):', False);
  DbPage.Values[0] := 'localhost';
  DbPage.Values[1] := '5432';
  DbPage.Values[2] := 'faculty_attendance_new';
  DbPage.Values[3] := 'postgres';
  DbPage.Values[5] := 'C:\Program Files\PostgreSQL\18\bin';

  AppPage := CreateInputQueryPage(
    DbPage.ID,
    'Application Settings & Administrator',
    'Configure the web application port and initial administrator.',
    'Initialization is applied only for brand new empty databases. Existing records and users are always preserved.'
  );
  AppPage.Add('Web Application Port:', False);
  AppPage.Add('Initial Administrator Username:', False);
  AppPage.Add('Initial Administrator Password:', True);
  AppPage.Values[0] := '3000';
  AppPage.Values[1] := 'dean';
  AppPage.Values[2] := 'Dean@12345';

  OptionPage := CreateInputOptionPage(
    AppPage.ID,
    'Host & Network Deployment Options',
    'Select access and initialization options for this host.',
    'LAN access allows authorized computers on the same network subnet to access the system via browser.',
    False,
    False
  );
  OptionPage.Add('Enable LAN access from other computers on the local network (creates firewall rule)');
  OptionPage.Add('Create the database if it does not already exist');
  OptionPage.Add('Initialize a fresh database with default roles, permissions, and administrator');
  OptionPage.Add('Create a Desktop Shortcut for the Control Panel');

  OptionPage.Values[0] := True;
  OptionPage.Values[1] := True;
  if IsUpgrade then
    OptionPage.Values[2] := False
  else
    OptionPage.Values[2] := True;
  OptionPage.Values[3] := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = DbPage.ID then
  begin
    if Trim(DbPage.Values[0]) = '' then
    begin
      MsgBox('Database host is required.', mbError, MB_OK);
      Result := False;
    end
    else if not ValidPort(DbPage.Values[1]) then
    begin
      MsgBox('Database port must be between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end
    else if not IsSimpleName(Trim(DbPage.Values[2])) then
    begin
      MsgBox('Database name must contain only letters, numbers, and underscores.', mbError, MB_OK);
      Result := False;
    end
    else if Trim(DbPage.Values[3]) = '' then
    begin
      MsgBox('Database user is required.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = AppPage.ID then
  begin
    if not ValidPort(AppPage.Values[0]) then
    begin
      MsgBox('Web port must be between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end
    else if OptionPage.Values[2] then
    begin
      if Trim(AppPage.Values[1]) = '' then
      begin
        MsgBox('An initial administrator username is required when initializing a database.', mbError, MB_OK);
        Result := False;
      end
      else if Length(AppPage.Values[2]) < 6 then
      begin
        MsgBox('The initial administrator password must be at least 6 characters.', mbError, MB_OK);
        Result := False;
      end;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigFile: String;
  Json: String;
  ResultCode: Integer;
  ErrorCode: Integer;
  SetupScript: String;
  SetupParams: String;
begin
  if CurStep <> ssPostInstall then Exit;

  ConfigFile := ExpandConstant('{commonappdata}\FacultyAttendance\install.json');
  ForceDirectories(ExtractFileDir(ConfigFile));
  Json := '{"' +
    'DbHost":"' + JsonEscape(Trim(DbPage.Values[0])) + '",' +
    '"DbPort":' + IntToStr(StrToIntDef(DbPage.Values[1], 5432)) + ',' +
    '"DbName":"' + JsonEscape(Trim(DbPage.Values[2])) + '",' +
    '"DbUser":"' + JsonEscape(Trim(DbPage.Values[3])) + '",' +
    '"DbPassword":"' + JsonEscape(DbPage.Values[4]) + '",' +
    '"PostgresBin":"' + JsonEscape(Trim(DbPage.Values[5])) + '",' +
    '"AppPort":' + IntToStr(StrToIntDef(AppPage.Values[0], 3000)) + ',' +
    '"AllowLan":' + BoolJson(OptionPage.Values[0]) + ',' +
    '"CreateDatabase":' + BoolJson(OptionPage.Values[1]) + ',' +
    '"Initialize":' + BoolJson(OptionPage.Values[2]) + ',' +
    '"AdminUser":"' + JsonEscape(Trim(AppPage.Values[1])) + '",' +
    '"AdminPassword":"' + JsonEscape(AppPage.Values[2]) + '",' +
    '"DesktopShortcut":' + BoolJson(OptionPage.Values[3]) + ',' +
    '"UseHttps":false' +
    '}';

  if not SaveStringToFile(ConfigFile, Json, False) then
  begin
    MsgBox('Could not write temporary setup configuration.', mbError, MB_OK);
    Abort;
  end;

  SetupScript := ExpandConstant('{app}\scripts\windows\Setup-FacultyAttendance.ps1');
  SetupParams := '-NoProfile -ExecutionPolicy Bypass -File "' + SetupScript + '" -ConfigFile "' + ConfigFile + '"';
  if not Exec('powershell.exe', SetupParams, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    DeleteFile(ConfigFile);
    MsgBox('Could not run the application setup script.', mbError, MB_OK);
    Abort;
  end;
  if ResultCode <> 0 then
  begin
    DeleteFile(ConfigFile);
    MsgBox('Application setup did not complete successfully. See C:\ProgramData\FacultyAttendance\logs\setup.log for details. Existing database records were preserved.', mbError, MB_OK);
    Abort;
  end;
  DeleteFile(ConfigFile);

  if not ShellExec('open', 'http://localhost:' + AppPage.Values[0] + '/', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode) then
  begin
    MsgBox('Installation completed successfully. You can open the system from your browser at http://localhost:' + AppPage.Values[0] + '/', mbInformation, MB_OK);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  DataDir: String;
  KeepData: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    // Stop background service and clean up firewall/scheduled tasks
    Exec('schtasks.exe', '/End /TN "FacultyAttendance"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('schtasks.exe', '/Delete /TN "FacultyAttendance" /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('schtasks.exe', '/Delete /TN "FacultyAttendanceBackup" /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('netsh.exe', 'advfirewall firewall delete rule name="Faculty Attendance Web"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end
  else if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{commonappdata}\FacultyAttendance');
    if DirExists(DataDir) then
    begin
      KeepData := MsgBox(
        'Do you want to permanently delete database backups, logs, and configuration data?' + #13#10 + #13#10 +
        'Location: ' + DataDir + #13#10 + #13#10 +
        'Click [NO] (Recommended) to preserve all database records, configurations, and backups.' + #13#10 +
        'Click [YES] to permanently delete them.',
        mbConfirmation, MB_YESNO or MB_DEFBUTTON2
      );
      if KeepData = IDYES then
      begin
        DelTree(DataDir, True, True, True);
      end;
    end;
  end;
end;
