# 下载文件的保存路径 (请修改为你的实际目录，确保该目录存在且有写入权限)
dir=/var/apps/Aria2/shares/Downloads

# 磁盘缓存, 0 为禁用缓存，默认:16M
# 磁盘缓存的作用是把下载的数据块临时存储在内存中，然后集中写入硬盘，以减少磁盘 I/O ，提升读写性能，延长硬盘寿命。
# 建议在有足够的内存空闲情况下适当增加，但不要超过剩余可用内存空间大小。
# 此项值仅决定上限，实际对内存的占用取决于网速(带宽)和设备性能等其它因素。
disk-cache=64M

# 文件预分配方式, 可选：none, prealloc, trunc, falloc, 默认:prealloc
# 预分配对于机械硬盘可有效降低磁盘碎片、提升磁盘读写性能、延长磁盘寿命。
# 机械硬盘使用 ext4（具有扩展支持），btrfs，xfs 或 NTFS（仅 MinGW 编译版本）等文件系统建议设置为 falloc
# 若无法下载，提示 fallocate failed.cause：Operation not supported 则说明不支持，请设置为 none
# prealloc 分配速度慢, trunc 无实际作用，不推荐使用。
# 固态硬盘不需要预分配，只建议设置为 none ，否则可能会导致双倍文件大小的数据写入，从而影响寿命。
file-allocation=none

# 文件预分配大小限制。小于此选项值大小的文件不预分配空间，单位 K 或 M，默认：5M
no-file-allocation-limit=64M

# 断点续传
continue=true

# 获取服务器文件时间，默认:false
remote-time=true

# 断点续传文件保存位置
input-file=/var/apps/Aria2/shares/data/aria2.session
save-session=/var/apps/Aria2/shares/data/aria2.session
# 定时保存会话，0表示退出时保存 (秒)
save-session-interval=1
state-save-interval=20

# 强制保存，即使任务已完成也保存信息到会话文件, 默认:false
# 开启后会在任务完成后保留 .aria2 文件，文件被移除且任务存在的情况下重启后会重新下载。
# 关闭后已完成的任务列表会在重启后清空。
force-save=false

# 最大同时下载任务数 (全局)
max-concurrent-downloads=5

# 每个文件的最大连接数 (单文件多线程，1-16，推荐 16)
stream-max-connections=16

# 每个下载任务的分割数 (即线程数，max-connection-per-server 的别名)
stream-max-connections=16

# 下载速度限制 (0 表示不限制)，单位 K/M/G
# max-download-limit=0
# max-upload-limit=100K

# GZip 支持，默认:false
http-accept-gzip=true

# 禁用 netrc 支持，默认:false
no-netrc=true

# 允许覆盖，当相关控制文件(.aria2)不存在时从头开始重新下载。默认:false
allow-overwrite=false

# 文件自动重命名，此选项仅在 HTTP(S)/FTP 下载中有效。新文件名在名称之后扩展名之前加上一个点和一个数字（1..9999）。默认:true
auto-file-renaming=true


# 最低 TLS 版本，可选：TLSv1.1、TLSv1.2、TLSv1.3 默认:TLSv1.2
#min-tls-version=TLSv1.2

# 启用 RPC 服务器
enable-rpc=true

# 允许所有来源的 RPC 请求 (如果只在本地用，可改为 false 更安全)
rpc-listen-all=true

# RPC 监听端口
rpc-listen-port=6800

# RPC 访问密钥 (重要！Web UI 连接时需要填这个密码)
# 请修改为一个复杂的字符串，防止被他人恶意控制
rpc-secret=${PRC_SECRET}

# 允许通过 HTTP 进行 RPC 请求
rpc-allow-origin-all=true

# 启用 DHT (分布式哈希表)，用于在没有 Tracker 的情况下寻找节点
enable-dht=true

# 启用 Peer Exchange (节点交换)
enable-peer-exchange=true

bt-tracker=http://1337.abcvg.info:80/announce,http://bt.okmp3.ru:2710/announce,http://ipv4.rer.lol:2710/announce,http://ipv6.rer.lol:6969/announce,http://lucke.fenesisu.moe:6969/announce,http://nyaa.tracker.wf:7777/announce,http://torrentsmd.com:8080/announce,http://tr.cili001.com:8070/announce,http://tracker.dhitechnical.com:6969/announce,http://tracker.mywaifu.best:6969/announce,http://tracker.renfei.net:8080/announce,http://tracker.skyts.net:6969/announce,http://tracker.waaa.moe:6969/announce,http://tracker.xn--djrq4gl4hvoi.top:80/announce,http://www.all4nothin.net:80/announce,http://www.wareztorrent.com:80/announce,https://1337.abcvg.info:443/announce,https://shahidrazi.online:443/announce,https://t.213891.xyz:443/announce,https://torrent.tracker.durukanbal.com:443/announce,https://tr.abiir.top:443/announce,https://tr.abir.ga:443/announce,https://tr.nyacat.pw:443/announce,https://tracker.ghostchu-services.top:443/announce,https://tracker.iochimari.moe:443/announce,https://tracker.kuroy.me:443/announce,https://tracker.manager.v6.navy:443/announce,https://tracker.qingwapt.org:443/announce,https://tracker.zhuqiy.com:443/announce,https://tracker1.520.jp:443/announce,udp://bt.rer.lol:6969/announce,udp://evan.im:6969/announce,udp://exodus.desync.com:6969/announce,udp://extracker.dahrkael.net:6969/announce,udp://martin-gebhardt.eu:25/announce,udp://ns575949.ip-51-222-82.net:6969/announce,udp://open.demonii.com:1337/announce,udp://open.stealth.si:80/announce,udp://p4p.arenabg.com:1337/announce,udp://retracker.lanta.me:2710/announce,udp://torrentvpn.club:6990/announce,udp://tracker-udp.gbitt.info:80/announce,udp://tracker.1h.is:1337/announce,udp://tracker.bluefrog.pw:2710/announce,udp://tracker.breizh.pm:6969/announce,udp://tracker.corpscorp.online:80/announce,udp://tracker.dler.com:6969/announce,udp://tracker.flatuslifir.is:6969/announce,udp://tracker.fnix.net:6969/announce,udp://tracker.gmi.gd:6969/announce,udp://tracker.iperson.xyz:6969/announce,udp://tracker.ixuexi.click:6969/announce,udp://tracker.opentorrent.top:6969/announce,udp://tracker.opentrackr.org:1337/announce,udp://tracker.playground.ru:6969/announce,udp://tracker.plx.im:6969/announce,udp://tracker.qu.ax:6969/announce,udp://tracker.riverarmy.xyz:6969/announce,udp://tracker.skyts.net:6969/announce,udp://tracker.srv00.com:6969/announce,udp://tracker.t-1.org:6969/announce,udp://tracker.theoks.net:6969/announce,udp://tracker.therarbg.to:6969/announce,udp://tracker.torrent.eu.org:451/announce,udp://tracker.tryhackx.org:6969/announce,udp://tracker.tvunderground.org.ru:3218/announce,udp://tracker.wepzone.net:6969/announce,udp://uabits.today:6990/announce,udp://udp.tracker.projectk.org:23333/announce,udp://utracker.ghostchu-services.top:6969/announce,udp://wepzone.net:6969/announce,wss://tracker.openwebtorrent.com:443/announce

# 监听端口 (BT)
listen-port=6881

# DHT 网络引导节点
bt-dht-bootstrap-nodes=dht.transmissionbt.com:6881

# 本地节点发现, PT 下载(私有种子)会自动禁用 默认:false
bt-enable-lpd=true

# 强制加密 (防止某些 ISP 干扰 BT 流量)
bt-encryption=preferred

# 日志级别：debug, info, notice, warn, error
log-level=info

# 日志文件路径 (留空则输出到 stderr)
log=/var/apps/Aria2/shares/data/aria2.log

# 禁用 IPv6 (如果你的网络 IPv6 有问题导致连接慢，可以取消下面这行的注释)
# disable-ipv6=true

# 文件预分配方式：none, prealloc, falloc, trunc
# falloc 最快 (需要文件系统支持，如 ext4, xfs)，prealloc 兼容性最好
file-allocation=falloc
