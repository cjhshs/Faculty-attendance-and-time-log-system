# LAN Access Guide: Accessing the System from Other Computers

## 1. Network Architecture Overview

The **Faculty Attendance and Time Log System** uses a **central host architecture**:
* The application server and PostgreSQL database run **exclusively on the designated host PC**.
* Other client PCs (e.g. Department Chairs, Deans, Attendance Encoders) connect via their web browsers (**Google Chrome, Microsoft Edge, Firefox**).
* **Client computers do NOT need Node.js, PostgreSQL, or any software installation.**

```
+-------------------------------------------------------------+
|                     Host Computer (Server)                  |
|  - Windows Background Service (Next.js on Port 3000)        |
|  - PostgreSQL Database (Port 5432 - Localhost Only)         |
|  - Static LAN IP: 192.168.1.100                             |
+-------------------------------------------------------------+
                               |
                   Local Area Network (LAN)
                               |
        +----------------------+----------------------+
        |                                             |
+-----------------------+                     +-----------------------+
|  Client PC 1 (Dean)   |                     | Client PC 2 (Encoder) |
|  Browser:             |                     | Browser:              |
|  http://192.168.1.100 |                     | http://192.168.1.100  |
+-----------------------+                     +-----------------------+
```

---

## 2. Finding the Host Computer's IP Address

### Method A: Using the Faculty Attendance Control Panel (Recommended)
1. Open the **Faculty Attendance Control Panel** on the host desktop.
2. In the **Access Addresses** card, look at the **LAN Access URL** field.
3. Example: `http://192.168.1.100:3000/`.
4. Click **Copy URL**.

### Method B: Using Windows Command Prompt
1. On the host computer, open Command Prompt or PowerShell.
2. Run:
   ```cmd
   ipconfig
   ```
3. Locate your active network adapter (Ethernet or Wi-Fi) and note the **IPv4 Address** (e.g., `192.168.1.100`).

---

## 3. Best Practice: Set a Static IP for the Host Computer

To prevent the host IP address from changing when the computer restarts:
1. Open Windows **Settings** > **Network & Internet** > **Ethernet** (or **Wi-Fi**).
2. Click **Edit IP assignment** and select **Manual**.
3. Toggle on **IPv4** and assign a fixed IP address within your school's router subnet (or configure a DHCP Reservation in your router settings).

---

## 4. Connecting Client Computers

1. Ensure the client computer is connected to the same school Wi-Fi or Ethernet network.
2. Open any web browser on the client computer.
3. Enter the Host URL in the address bar:
   ```
   http://<HOST-IP>:3000/
   ```
   *Example: `http://192.168.1.100:3000/`*
4. The Faculty Attendance login page will appear.
5. Users log in with their assigned username and password.

---

## 5. Creating a Desktop Shortcut on Client Computers

To make access easy for department staff:
1. On the client desktop, right-click an empty area and select **New > Shortcut**.
2. In the location field, type:
   ```
   http://192.168.1.100:3000/
   ```
3. Click **Next**, name the shortcut `Faculty Attendance System`, and click **Finish**.

---

## 6. Security & Firewall Rules

* **Inbound Access**: The installer creates a Windows Firewall rule named `Faculty Attendance Web`:
  * **Protocol**: TCP
  * **Port**: 3000
  * **Profile**: Private network only
  * **Scope**: LocalSubnet only
* **Database Isolation**: PostgreSQL port `5432` is **NOT** exposed to the LAN. Only the web application interacts with the database. This prevents unauthorized access or direct database tampering from client PCs.
