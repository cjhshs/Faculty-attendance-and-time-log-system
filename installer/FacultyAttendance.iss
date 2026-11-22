; Faculty Attendance and Time Log System - Production Windows Installer
; Build the package first with scripts\windows\Build-Package.ps1.
; The installer never contains database or application secrets. Values entered
; in the wizard are written to a temporary secure file, consumed by the setup script,
; and deleted immediately.
; For unattended deployments, /FACONFIGFILE=<path> may supply a [FacultyAttendance]
; section with DbHost, DbPort, DbName, DbUser, DbPassword, PostgresBin, AppPort,
; AdminUser, AdminPassword, AllowLan, CreateDatabase, Initialize, DesktopShortcut
; and OpenBrowser values. Interactive installs are unchanged.

#define AppName "Faculty Attendance and Time Log System"
#define AppShortName "FacultyAttendance"
#define AppVersion "1.0.4"
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
VersionInfoVersion=1.0.4.0

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
  OpenBrowserAfterInstall: Boolean;

function InitializeSetup(): Boolean;
var
  InstallKey: String;
begin
  Result := True;
  IsUpgrade := False;
  OpenBrowserAfterInstall := True;
  InstallKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppIdGuid}_is1';
  if RegQueryStringValue(HKLM, InstallKey, 'DisplayVersion', InstalledVersion) then
  begin
    IsUpgrade := True;
  end;
end;

function CleanDbName(const S: String): String;
var
  T: String;
  P: Integer;
begin
  T := Trim(S);
  while (Length(T) > 0) and ((T[1] = '/') or (T[1] = '\')) do
    Delete(T, 1, 1);
  P := Pos('?', T);
  if P > 0 then
    T := Copy(T, 1, P - 1);
  P := Pos('=', T);
  if P > 0 then
    T := Copy(T, 1, P - 1);
  Result := Trim(T);
end;

function IsValidPostgresIdentifier(const S: String): Boolean;
var
  I: Integer;
  C: Char;
begin
  Result := False;
  if (S = '') or (Length(S) > 63) then Exit;
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

procedure TryLoadExistingEnv;
var
  EnvPath: String;
  Lines: TArrayOfString;
  I, P: Integer;
  Line, Key, Val: String;
  SlashPos, AtPos, ColonPos, QuestPos: Integer;
  DbUrl, HostPart, DbPart: String;
begin
  EnvPath := ExpandConstant('{commonappdata}\FacultyAttendance\app.env');
  if not FileExists(EnvPath) then Exit;
  if not LoadStringsFromFile(EnvPath, Lines) then Exit;
  for I := 0 to GetArrayLength(Lines) - 1 do
  begin
    Line := Trim(Lines[I]);
    if (Line = '') or (Line[1] = '#') then Continue;
    P := Pos('=', Line);
    if P <= 1 then Continue;
    Key := Trim(Copy(Line, 1, P - 1));
    Val := Trim(Copy(Line, P + 1, Length(Line) - P));
    if (Length(Val) >= 2) and (Val[1] = '"') and (Val[Length(Val)] = '"') then
      Val := Copy(Val, 2, Length(Val) - 2);

    if Key = 'PORT' then
      AppPage.Values[0] := Val
    else if Key = 'DATABASE_URL' then
    begin
      DbUrl := Val;
      QuestPos := Pos('?', DbUrl);
      if QuestPos > 0 then
        DbUrl := Copy(DbUrl, 1, QuestPos - 1);
      SlashPos := 0;
      for P := Length(DbUrl) downto 1 do
      begin
        if DbUrl[P] = '/' then
        begin
          SlashPos := P;
          Break;
        end;
      end;
      if SlashPos > 0 then
      begin
        DbPart := CleanDbName(Copy(DbUrl, SlashPos + 1, Length(DbUrl) - SlashPos));
        if DbPart <> '' then
          DbPage.Values[2] := DbPart;
      end;
      AtPos := Pos('@', DbUrl);
      if (AtPos > 0) and (SlashPos > AtPos) then
      begin
        HostPart := Copy(DbUrl, AtPos + 1, SlashPos - AtPos - 1);
        ColonPos := Pos(':', HostPart);
        if ColonPos > 0 then
        begin
          DbPage.Values[0] := Copy(HostPart, 1, ColonPos - 1);
          DbPage.Values[1] := Copy(HostPart, ColonPos + 1, Length(HostPart) - ColonPos);
        end
        else
        begin
          DbPage.Values[0] := HostPart;
        end;
      end;
    end;
  end;
end;

function ParseConfigBool(const S: String; DefaultValue: Boolean): Boolean;
var
  U: String;
begin
  U := Uppercase(Trim(S));
  if (U = 'TRUE') or (U = '1') or (U = 'YES') then
    Result := True
  else if (U = 'FALSE') or (U = '0') or (U = 'NO') then
    Result := False
  else
    Result := DefaultValue;
end;

procedure ApplyConfigFileOverrides;
var
  I, LineIndex, EqPos: Integer;
  Param, ConfigPath, Line, Key, Val, Section: String;
  Lines: TArrayOfString;
  InSection: Boolean;
begin
  for I := 1 to ParamCount do
  begin
    Param := ParamStr(I);
    if Pos('/FACONFIGFILE=', Uppercase(Param)) = 1 then
    begin
      ConfigPath := Copy(Param, Length('/FACONFIGFILE=') + 1, Length(Param));
      if (ConfigPath = '') or not FileExists(ConfigPath) then Continue;
      if not LoadStringsFromFile(ConfigPath, Lines) then Continue;

      InSection := False;
      for LineIndex := 0 to GetArrayLength(Lines) - 1 do
      begin
        Line := Trim(Lines[LineIndex]);
        if (Line = '') or (Line[1] = ';') or (Line[1] = '#') then Continue;
        if Line[1] = '[' then
        begin
          if Length(Line) >= 2 then
            Section := Trim(Copy(Line, 2, Length(Line) - 2))
          else
            Section := '';
          InSection := Uppercase(Section) = 'FACULTYATTENDANCE';
          Continue;
        end;
        if not InSection then Continue;

        EqPos := Pos('=', Line);
        if EqPos <= 1 then Continue;
        Key := Uppercase(Trim(Copy(Line, 1, EqPos - 1)));
        Val := Trim(Copy(Line, EqPos + 1, Length(Line) - EqPos));

        if Key = 'DBHOST' then DbPage.Values[0] := Val
        else if Key = 'DBPORT' then DbPage.Values[1] := Val
        else if Key = 'DBNAME' then DbPage.Values[2] := Val
        else if Key = 'DBUSER' then DbPage.Values[3] := Val
        else if Key = 'DBPASSWORD' then DbPage.Values[4] := Val
        else if Key = 'POSTGRESBIN' then DbPage.Values[5] := Val
        else if Key = 'APPPORT' then AppPage.Values[0] := Val
        else if Key = 'ADMINUSER' then AppPage.Values[1] := Val
        else if Key = 'ADMINPASSWORD' then AppPage.Values[2] := Val
        else if Key = 'ALLOWLAN' then OptionPage.Values[0] := ParseConfigBool(Val, OptionPage.Values[0])
        else if Key = 'CREATEDATABASE' then OptionPage.Values[1] := ParseConfigBool(Val, OptionPage.Values[1])
        else if Key = 'INITIALIZE' then OptionPage.Values[2] := ParseConfigBool(Val, OptionPage.Values[2])
        else if Key = 'DESKTOPSHORTCUT' then OptionPage.Values[3] := ParseConfigBool(Val, OptionPage.Values[3])
        else if Key = 'OPENBROWSER' then OpenBrowserAfterInstall := ParseConfigBool(Val, OpenBrowserAfterInstall);
      end;
    end;
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
  begin
    OptionPage.Values[1] := False;
    OptionPage.Values[2] := False;
  end
  else
    OptionPage.Values[2] := True;
  OptionPage.Values[3] := True;

  TryLoadExistingEnv;
  ApplyConfigFileOverrides;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = DbPage.ID then
  begin
    DbPage.Values[2] := CleanDbName(DbPage.Values[2]);
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
    else if not IsValidPostgresIdentifier(DbPage.Values[2]) then
    begin
      MsgBox('Database name must be a valid PostgreSQL identifier (1 to 63 characters, starting with a letter or underscore, containing only letters, numbers, and underscores).' + #13#10 + #13#10 + 'Do not include slashes or parameters such as "?schema=public" in the database name.', mbError, MB_OK);
      Result := False;
    end
    else if Trim(DbPage.Values[3]) = '' then
    begin
      MsgBox('Database user is required.', mbError, MB_OK);
      Result := False;
    end
    else if DbPage.Values[4] = '' then
    begin
      MsgBox('Database password is required to connect to PostgreSQL.', mbError, MB_OK);
      Result := False;
    end
    else if Lowercase(Trim(DbPage.Values[4])) = 'postgres' then
    begin
      if MsgBox('Using "postgres" as the database password is weak and not recommended for production.' + #13#10 + #13#10 + 'Are you sure you want to proceed with this password?', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) <> IDYES then
      begin
        Result := False;
      end;
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
  DbPage.Values[2] := CleanDbName(DbPage.Values[2]);
  if not IsValidPostgresIdentifier(DbPage.Values[2]) then
  begin
    MsgBox('Database name is invalid. It must be a valid PostgreSQL identifier (1 to 63 characters, starting with a letter or underscore, containing only letters, numbers, and underscores).', mbError, MB_OK);
    Abort;
  end;
  Json := '{"' +
    'DbHost":"' + JsonEscape(Trim(DbPage.Values[0])) + '",' +
    '"DbPort":' + IntToStr(StrToIntDef(DbPage.Values[1], 5432)) + ',' +
    '"DbName":"' + JsonEscape(DbPage.Values[2]) + '",' +
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

  if OpenBrowserAfterInstall then
  begin
    if not ShellExec('open', 'http://localhost:' + AppPage.Values[0] + '/', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode) then
    begin
      MsgBox('Installation completed successfully. You can open the system from your browser at http://localhost:' + AppPage.Values[0] + '/', mbInformation, MB_OK);
    end;
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
