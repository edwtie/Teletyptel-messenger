set -eu
mkdir -p /tmp/tc/ebin /tmp/tc/spool
chmod 700 /tmp/tc /tmp/tc/spool
head -c 32 /dev/urandom | base64 > /tmp/tc/key
chmod 600 /tmp/tc/key
export ERL_LIBS=/home/ejabberd/lib
erl -boot /home/ejabberd/bin/start_clean -boot_var RELEASE_LIB /home/ejabberd/lib \
    -pa /home/ejabberd/lib/*/ebin -noshell -eval \
    'case compile:file("/source/mod_teletyptel_calls.erl", [report, {outdir,"/tmp/tc/ebin"}]) of {ok,_} -> halt(0); _ -> halt(1) end.'
printf 'ERL_OPTIONS="-pa /tmp/tc/ebin"\n' > /tmp/tc/ejabberdctl.cfg
cat > /tmp/tc/ejabberd.yml <<'CONFIG'
hosts: [example.test]
loglevel: warning
auth_method: internal
s2s_access: none
listen:
  - port: 5280
    ip: "0.0.0.0"
    module: ejabberd_http
    request_handlers:
      /xmpp-websocket: ejabberd_http_ws
modules:
  mod_roster: {}
  mod_privacy: {}
  mod_blocking: {}
  mod_teletyptel_calls: {}
CONFIG
export TELETYPTEL_CALL_SIGNALING=1
export TELETYPTEL_CALL_PUSH_ENVIRONMENT=production
export TELETYPTEL_CALL_SIGNALING_DOMAIN=example.test
export TELETYPTEL_CALL_SIGNALING_ISSUER=fixture
export TELETYPTEL_CALL_SIGNALING_KEY_FILE=/tmp/tc/key
export TELETYPTEL_CALL_SIGNALING_SPOOL=/tmp/tc/spool
exec ejabberdctl -c /tmp/tc/ejabberdctl.cfg -f /tmp/tc/ejabberd.yml foreground
