package com.adapters;

import android.content.ClipData;
import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.TextView;

import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;
import com.classes.Recipe;
import com.classes.ShoppingListItem;
import com.oz10.stropping.R;

import org.w3c.dom.Text;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by Austen on 19/08/2016.
 */

public class ShoppingListAdapter extends ArrayAdapter {

    public ArrayList<ShoppingListItem> _shoppingListItems;

    public ShoppingListAdapter(Context context, int resource, List objects) {
        super(context, resource, objects);

        _shoppingListItems = (ArrayList<ShoppingListItem>) objects;
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {

        View view = convertView;

        if (view == null){
            LayoutInflater layoutInflater = LayoutInflater.from(getContext());
            view = layoutInflater.inflate(R.layout.item_shoppinglist, null);
        }

        ShoppingListItem shoppingListItem = _shoppingListItems.get(position);

        if (shoppingListItem != null){
            SetShoppingListItemName(view, shoppingListItem);
            SetShoppingListItemQuantity(view, shoppingListItem);
        }

        return view;
    }
    
    private void SetShoppingListItemName(View view, ShoppingListItem shoppingListItem)
    {
        TextView textView = (TextView) view.findViewById(R.id.shoppinglistitem_name);
        textView.setText(shoppingListItem.getName());
    }
    
    private void SetShoppingListItemQuantity(View view, ShoppingListItem shoppingListItem)
    {
        TextView textView = (TextView) view.findViewById(R.id.shoppinglistitem_quantity);
        textView.setText(Integer.toString(shoppingListItem.getQuantity()));
    }

    public void updateAdapterFromDatabase(Context context)
    {
        StroppingDatabase db = new StroppingDatabase(context);
        db.open();

        this._shoppingListItems.clear();

        ArrayList<ShoppingListItem> shoppingListItems = db.getAllShoppingListItems();
        for (ShoppingListItem shoppingListItem:shoppingListItems
                ) {
            add(shoppingListItem);
        }

        notifyDataSetChanged();

        db.close();

    }
}
