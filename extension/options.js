const api = globalThis.browser ?? globalThis.chrome
const input = document.getElementById('site')
Promise.resolve(api.storage.sync.get('site')).then(function (s) { input.value = (s && s.site) || '' })
document.getElementById('save').addEventListener('click', function () {
  const v = input.value.trim()
  const done = function () { document.getElementById('ok').textContent = 'Enregistré.' }
  if (v && !/^https?:\/\//i.test(v)) { document.getElementById('ok').textContent = 'L\'adresse doit commencer par https://'; return }
  Promise.resolve(v ? api.storage.sync.set({ site: v }) : api.storage.sync.remove('site')).then(done)
})
