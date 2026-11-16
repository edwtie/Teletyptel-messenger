set -eu
umask 077
mkdir -p /tmp/tc/ebin /tmp/tc/spool
head -c 32 /dev/urandom | base64 > /tmp/tc/bootstrap.key
head -c 32 /dev/urandom | base64 > /tmp/tc/signaling.key
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 -subj /CN=example.test \
    -addext subjectAltName=DNS:example.test,IP:127.0.0.1 -keyout /tmp/tc/tls.key -out /tmp/tc/tls.crt >/dev/null 2>&1
cat /tmp/tc/tls.key /tmp/tc/tls.crt > /tmp/tc/tls.pem
export ERL_LIBS=/home/ejabberd/lib
erl -boot /home/ejabberd/bin/start_clean -boot_var RELEASE_LIB /home/ejabberd/lib \
    -pa /home/ejabberd/lib/*/ebin -noshell -eval \
    'lists:foreach(fun(File) -> case compile:file(File, [report, {outdir,"/tmp/tc/ebin"}]) of {ok,_} -> ok; _ -> halt(1) end end, ["/source/ejabberd_auth_teletyptel_calls.erl", "/source/teletyptel_call_ws.erl", "/source/mod_teletyptel_calls.erl"]), halt(0).'
printf 'ERL_OPTIONS="-pa /tmp/tc/ebin"\n' > /tmp/tc/ejabberdctl.cfg
cat > /tmp/tc/ejabberd.yml <<'CONFIG'
hosts: [example.test]
loglevel: warning
auth_method: [teletyptel_calls, internal]
s2s_access: none
certfiles: [/tmp/tc/tls.pem]
listen:
  - port: 5443
    ip: "0.0.0.0"
    module: ejabberd_http
    tls: true
    request_handlers:
      /xmpp-call-websocket: teletyptel_call_ws
      /xmpp-websocket: ejabberd_http_ws
  - port: 5444
    ip: "0.0.0.0"
    module: ejabberd_http
    request_handlers:
      /xmpp-call-websocket: teletyptel_call_ws
      /xmpp-websocket: ejabberd_http_ws
  - port: 5223
    ip: "0.0.0.0"
    module: ejabberd_c2s
    tls: true
  - port: 5222
    ip: "0.0.0.0"
    module: ejabberd_c2s
modules:
  mod_ping: {}
  mod_roster: {}
  mod_admin_extra: {}
  mod_mam:
    db_type: mnesia
    default: always
  mod_register: {}
CONFIG
if [ "${TELETYPTEL_CALL_ACTIVE_FIXTURE:-0}" = 1 ]; then
    printf '  mod_privacy: {}\n  mod_blocking: {}\n  mod_teletyptel_calls: {}\n' >> /tmp/tc/ejabberd.yml
    export TELETYPTEL_CALL_SIGNALING=1
    export TELETYPTEL_CALL_PUSH_ENVIRONMENT=production
    export TELETYPTEL_CALL_SIGNALING_DOMAIN=example.test
    export TELETYPTEL_CALL_SIGNALING_ISSUER=fixture
    export TELETYPTEL_CALL_SIGNALING_KEY_FILE=/tmp/tc/signaling.key
    export TELETYPTEL_CALL_SIGNALING_SPOOL=/tmp/tc/spool
fi
export TELETYPTEL_CALL_SCOPED_AUTH=1
export TELETYPTEL_CALL_SCOPED_DOMAIN=example.test
export TELETYPTEL_CALL_SCOPED_ENVIRONMENT=production
export TELETYPTEL_CALL_SCOPED_ISSUER=fixture
export TELETYPTEL_CALL_SCOPED_KEY_FILE=/tmp/tc/bootstrap.key
exec ejabberdctl -c /tmp/tc/ejabberdctl.cfg -f /tmp/tc/ejabberd.yml foreground
