; Faculty Attendance Windows installer.
; Build the package first with scripts\windows\Build-Package.ps1.
; The installer never contains database or application secrets. Values entered
; in the wizard are written to a temporary file, consumed by the setup script,
; and deleted.

#define AppName "Faculty Attendance"
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
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=FacultyAttendance-Setup
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

[Files]
Source: "..\dist\FacultyAttendance\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Code]
var
  DbPage: TInputQueryWizardPage;
  AppPage: TInputQueryWizardPage;
  OptionPage: TInputOptionWizardPage;

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
    'Database connection',
    'Enter the PostgreSQL connection details for this host.',
    'The installer will back up an existing database before applying migrations. It never resets or seeds an existing database automatically.'
  );
  DbPage.Add('Host:', False);
  DbPage.Add('Port:', False);
  DbPage.Add('Database:', False);
  DbPage.Add('User:', False);
  DbPage.Add('Password:', True);
  DbPage.Add('PostgreSQL bin folder (optional):', False);
  DbPage.Values[0] := 'localhost';
  DbPage.Values[1] := '5432';
  DbPage.Values[2] := 'faculty_attendance_new';
  DbPage.Values[3] := 'postgres';
  DbPage.Values[5] := 'C:\Program Files\PostgreSQL\18\bin';

  AppPage := CreateInputQueryPage(
    DbPage.ID,
    'Application settings',
    'Enter the web port and optional first-administrator details.',
    'Initialization is used only for a new empty database. Leave the administrator password blank when installing over an existing database.'
  );
  AppPage.Add('Web port:', False);
  AppPage.Add('Initial administrator username:', False);
  AppPage.Add('Initial administrator password:', True);
  AppPage.Values[0] := '3000';
  AppPage.Values[1] := 'dean';

  OptionPage := CreateInputOptionPage(
    AppPage.ID,
    'Host options',
    'Choose the safe default for this host.',
    'LAN access is restricted by a Private-profile firewall rule to LocalSubnet. The default transport is HTTP on the private LAN; use an HTTPS reverse proxy if encrypted LAN traffic is required.',
    False,
    False
  );
  OptionPage.Add('Allow access from other computers on the private LAN');
  OptionPage.Add('Create the database if it does not already exist');
  OptionPage.Add('Initialize a new empty database with reference data and the first administrator');
  OptionPage.Add('Create a desktop shortcut on this host');
  OptionPage.Values[0] := True;
  OptionPage.Values[1] := False;
  OptionPage.Values[2] := False;
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
      else if Length(AppPage.Values[2]) < 8 then
      begin
        MsgBox('The initial administrator password must be at least 8 characters.', mbError, MB_OK);
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
    MsgBox('Could not write the temporary setup configuration.', mbError, MB_OK);
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
    MsgBox('Application setup did not complete. See C:\ProgramData\FacultyAttendance\logs\setup.log for details. The database was not reset.', mbError, MB_OK);
    Abort;
  end;
  DeleteFile(ConfigFile);

  if not ShellExec('open', 'http://localhost:' + AppPage.Values[0] + '/', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode) then
  begin
    MsgBox('Installation completed, but the browser could not be opened automatically.', mbInformation, MB_OK);
  end;
end;
