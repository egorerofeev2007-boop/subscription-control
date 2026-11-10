import json
from datetime import date, datetime
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import connection, transaction, IntegrityError
from django.http import JsonResponse, HttpResponseNotAllowed

def profile_zone(value):
    if isinstance(value, str) and 0 < len(value) <= 64:
        try:
            return ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError):
            pass
    return None

def payload(request):
    try:
        data = json.loads(request.body.decode('utf-8') or '{}')
    except (UnicodeDecodeError, json.JSONDecodeError): return None
    return data if isinstance(data, dict) else None

def current_user(request):
    value = request.session.get('user_id')
    return UUID(value) if value else None

def fail(message, status=400): return JsonResponse({'error': message}, status=status)

def rows_to_state(user_id):
    with connection.cursor() as cur:
        cur.execute('SELECT email,timezone FROM app_user WHERE id=%s',[str(user_id)]); account=cur.fetchone()
    with connection.cursor() as cur:
        cur.execute('SELECT id, name FROM category WHERE owner_id=%s ORDER BY name', [str(user_id)])
        categories=[{'id':str(a),'name':b} for a,b in cur.fetchall()]
        cur.execute('''SELECT s.id,s.name,s.category_id,s.deactivated_from,
                              v.price_kopecks,v.period_count,v.period_unit,v.anchor_date,v.valid_from
                       FROM subscription s JOIN condition_version v ON v.subscription_id=s.id
                       WHERE s.owner_id=%s AND v.valid_from=(SELECT max(v2.valid_from) FROM condition_version v2 WHERE v2.subscription_id=s.id)
                       ORDER BY s.name''',[str(user_id)])
        subscriptions=[]
        for row in cur.fetchall():
            sid,name,cat,deact,price,count,unit,anchor,valid=row
            cur.execute('''SELECT price_kopecks,period_count,period_unit,anchor_date,valid_from
                           FROM condition_version WHERE subscription_id=%s ORDER BY valid_from''',[str(sid)])
            versions=[{'price':int(a),'count':int(b),'unit':c,'anchorDate':d.isoformat(),'validFrom':e.isoformat()} for a,b,c,d,e in cur.fetchall()]
            subscriptions.append({'id':str(sid),'name':name,'categoryId':str(cat),'deactivatedFrom':deact.isoformat() if deact else None,'versions':versions})
    timezone = account[1] if account and profile_zone(account[1]) else 'Asia/Magadan'
    return {'categories':categories,'subscriptions':subscriptions,'user':str(user_id),'email':account[0] if account else '', 'timezone':timezone}

def login_view(request):
    if request.method!='POST': return HttpResponseNotAllowed(['POST'])
    data=payload(request)
    if not data or not isinstance(data.get('email'), str) or not isinstance(data.get('password'), str):
        return fail('Заполните электронную почту и пароль.')
    with connection.cursor() as cur:
        cur.execute('SELECT id,password_hash FROM app_user WHERE lower(email)=lower(%s)',[data['email'].strip()]); row=cur.fetchone()
    if not row or not check_password(data['password'],row[1]): return fail('Неверная электронная почта или пароль.',401)
    request.session.flush()
    request.session['user_id']=str(row[0]); return JsonResponse(rows_to_state(row[0]))

def register_view(request):
    if request.method!='POST': return HttpResponseNotAllowed(['POST'])
    data=payload(request); email=str((data or {}).get('email','')).strip().lower(); password=(data or {}).get('password',''); timezone=(data or {}).get('timezone','Asia/Magadan')
    try:
        validate_email(email)
    except ValidationError:
        return fail('Введите корректную электронную почту.')
    if not isinstance(password,str) or not 12<=len(password)<=128:return fail('Пароль должен содержать от 12 до 128 символов.')
    if not profile_zone(timezone):
        return fail('Выберите допустимый часовой пояс.')
    try:
        with transaction.atomic(), connection.cursor() as cur:
            uid=uuid4();cur.execute('INSERT INTO app_user(id,email,password_hash,timezone) VALUES(%s,%s,%s,%s)',[str(uid),email,make_password(password),timezone])
        request.session.flush()
        request.session['user_id']=str(uid); return JsonResponse(rows_to_state(uid),status=201)
    except IntegrityError:return fail('Учетная запись с такой почтой уже существует.',409)

def logout_view(request):
    if request.method != 'POST':
        return HttpResponseNotAllowed(['POST'])
    request.session.flush(); return JsonResponse({'ok':True})

def profile_view(request):
    if request.method != 'PATCH':
        return HttpResponseNotAllowed(['PATCH'])
    user = current_user(request)
    if not user:
        return fail('Требуется вход.', 401)
    timezone = (payload(request) or {}).get('timezone')
    if not profile_zone(timezone):
        return fail('Выберите допустимый часовой пояс.')
    with connection.cursor() as cur:
        cur.execute('UPDATE app_user SET timezone=%s WHERE id=%s', [timezone, user])
        if not cur.rowcount:
            return fail('Учётная запись не найдена.', 404)
    return JsonResponse({'timezone': timezone})

def state_view(request):
    user=current_user(request)
    if not user: return fail('Требуется вход.',401)
    return JsonResponse(rows_to_state(user))

def categories_view(request):
    user=current_user(request)
    if not user:return fail('Требуется вход.',401)
    if request.method=='GET':return JsonResponse(rows_to_state(user)['categories'],safe=False)
    if request.method!='POST':return HttpResponseNotAllowed(['GET','POST'])
    name = (payload(request) or {}).get('name')
    name = name.strip() if isinstance(name, str) else ''
    if not 1<=len(name)<=50:return fail('Название категории должно содержать от 1 до 50 символов.')
    try:
        with transaction.atomic(), connection.cursor() as cur:
            cid=uuid4();cur.execute('INSERT INTO category(id,owner_id,name) VALUES(%s,%s,%s)',[str(cid),str(user),name])
        return JsonResponse({'id':str(cid),'name':name},status=201)
    except IntegrityError:return fail('Категория с таким названием уже существует.',409)

def _subscription_input(data):
    if not data:return None,'Некорректный JSON.'
    name=str(data.get('name','')).strip(); price=data.get('price'); count=data.get('count'); unit=data.get('unit'); anchor=data.get('anchorDate'); category=data.get('categoryId'); valid=data.get('validFrom') or anchor
    if not 1<=len(name)<=100:return None,'Введите название от 1 до 100 символов.'
    if type(price) is not int or not 1<=price<=99999999:return None,'Цена должна быть целым числом копеек от 1 до 99999999.'
    if type(count) is not int or not 1<=count<=120:return None,'Период должен быть целым числом от 1 до 120.'
    if unit not in ('week','month','year'):return None,'Единица периода должна быть week, month или year.'
    if not anchor or not valid or not category:return None,'Заполните дату, дату действия и категорию.'
    try:
        anchor, valid = date.fromisoformat(anchor), date.fromisoformat(valid)
        category = UUID(category)
    except (ValueError, TypeError, AttributeError):
        return None, 'Введите корректные даты и выберите категорию.'
    if not all(2000 <= value.year <= 2100 for value in (anchor, valid)):
        return None, 'Укажите даты с 2000 по 2100 год.'
    return {'name':name,'price':price,'count':count,'unit':unit,'anchor':anchor,'valid':valid,'category':category},None

def subscriptions_view(request):
    user=current_user(request)
    if not user:return fail('Требуется вход.',401)
    if request.method=='GET':return JsonResponse(rows_to_state(user)['subscriptions'],safe=False)
    if request.method!='POST':return HttpResponseNotAllowed(['GET','POST'])
    data,error=_subscription_input(payload(request));
    if error:return fail(error)
    try:
        with transaction.atomic(),connection.cursor() as cur:
            sid=uuid4();vid=uuid4();
            cur.execute('INSERT INTO subscription(id,owner_id,category_id,name,created_at,updated_at,row_version) VALUES(%s,%s,%s,%s,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1)',[str(sid),str(user),data['category'],data['name']])
            cur.execute('INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP)',[str(vid),str(sid),data['valid'],data['anchor'],data['price'],data['count'],data['unit']])
        return JsonResponse({'id':str(sid)},status=201)
    except IntegrityError:return fail('Запись не сохранена: проверьте категорию и дату версии.',409)

def subscription_view(request,subscription_id):
    user=current_user(request)
    if not user:return fail('Требуется вход.',401)
    if request.method=='DELETE':
        with connection.cursor() as cur:cur.execute('DELETE FROM subscription WHERE id=%s AND owner_id=%s',[subscription_id,str(user)]);count=cur.rowcount
        return JsonResponse({'ok':True}) if count else fail('Запись не найдена.',404)
    if request.method!='PATCH':return HttpResponseNotAllowed(['PATCH','DELETE'])
    data,error=_subscription_input(payload(request));
    if error:return fail(error)
    try:
        with transaction.atomic(),connection.cursor() as cur:
            cur.execute('UPDATE subscription SET name=%s,category_id=%s,row_version=row_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=%s AND owner_id=%s',[data['name'],data['category'],subscription_id,str(user)])
            if cur.rowcount!=1:return fail('Запись не найдена.',404)
            cur.execute('INSERT INTO condition_version(id,subscription_id,valid_from,anchor_date,price_kopecks,period_count,period_unit,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,CURRENT_TIMESTAMP)',[str(uuid4()),subscription_id,data['valid'],data['anchor'],data['price'],data['count'],data['unit']])
        return JsonResponse({'ok':True})
    except IntegrityError:return fail('Условия на эту дату уже существуют или данные некорректны.',409)

def deactivate_view(request,subscription_id):
    user=current_user(request)
    if not user:return fail('Требуется вход.',401)
    if request.method!='POST':return HttpResponseNotAllowed(['POST'])
    with connection.cursor() as cur:
        cur.execute('SELECT timezone FROM app_user WHERE id=%s', [user])
        account = cur.fetchone()
        if not account:
            return fail('Требуется вход.', 401)
        zone = profile_zone(account[0]) or ZoneInfo('Asia/Magadan')
        today = datetime.now(zone).date()
        cur.execute('''UPDATE subscription
            SET deactivated_from=COALESCE(deactivated_from,%s),
                row_version=row_version+1,updated_at=CURRENT_TIMESTAMP
            WHERE id=%s AND owner_id=%s''', [today, subscription_id, user])
        count = cur.rowcount
    return JsonResponse({'ok':True}) if count else fail('Запись не найдена.',404)
